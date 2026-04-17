/**
 * Tests the abstract BaseRepository via a minimal in-test concrete subclass.
 *
 * Covers:
 *   - transaction-awareness: `this.client(tx)` picks `tx` when supplied, the
 *     shared PrismaService otherwise.
 *   - thin delegate wrappers (create/findUnique/findFirst/findMany/update/delete/count).
 *   - pagination math (skip/take clamping, meta, empty case).
 *   - soft-delete and restore helpers.
 *   - `withTransaction` forwards to `prisma.$transaction` with the default timeout.
 */
import { BaseRepository } from '@database/base.repository';
import { PrismaService } from '@database/prisma.service';
import { DbTransactionClient } from '@database/types';
import { createMockPrisma } from '../../helpers/mock-prisma';

/** Minimal concrete subclass — picks the `user` delegate off whichever client is given. */
class TestRepository extends BaseRepository<any, any, any, any, any, any> {
  protected delegateFor(client: PrismaService | DbTransactionClient) {
    return (client as any).user;
  }
}

describe('BaseRepository', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let repo: TestRepository;

  beforeEach(() => {
    prisma = createMockPrisma();
    repo = new TestRepository(prisma as unknown as PrismaService);
  });

  describe('delegate selection', () => {
    it('should route through the shared PrismaService when no tx is supplied', async () => {
      // --- ARRANGE ---
      (prisma.user as any).findUnique.mockResolvedValue({ id: 'u1' });

      // --- ACT ---
      const out = await repo.findUnique({ id: 'u1' });

      // --- ASSERT ---
      expect(out).toEqual({ id: 'u1' });
      expect((prisma.user as any).findUnique).toHaveBeenCalledWith({ where: { id: 'u1' } });
    });

    it('should route through the tx client when one is supplied', async () => {
      // --- ARRANGE ---
      const tx = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'u2' }) } } as any;

      // --- ACT ---
      const out = await repo.findUnique({ id: 'u2' }, undefined, tx);

      // --- ASSERT ---
      expect(out).toEqual({ id: 'u2' });
      expect(tx.user.findUnique).toHaveBeenCalledWith({ where: { id: 'u2' } });
      expect((prisma.user as any).findUnique).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should call the delegate with { data }', async () => {
      // --- ARRANGE ---
      (prisma.user as any).create.mockResolvedValue({ id: 'u1', name: 'A' });

      // --- ACT ---
      const out = await repo.create({ name: 'A' });

      // --- ASSERT ---
      expect(out).toEqual({ id: 'u1', name: 'A' });
      expect((prisma.user as any).create).toHaveBeenCalledWith({ data: { name: 'A' } });
    });
  });

  describe('findUnique', () => {
    it('should pass include when supplied', async () => {
      // --- ARRANGE ---
      (prisma.user as any).findUnique.mockResolvedValue(null);

      // --- ACT ---
      await repo.findUnique({ id: 'x' }, { departments: true });

      // --- ASSERT ---
      expect((prisma.user as any).findUnique).toHaveBeenCalledWith({
        where: { id: 'x' },
        include: { departments: true },
      });
    });
  });

  describe('findFirst', () => {
    it('should omit where when not provided', async () => {
      // --- ARRANGE ---
      (prisma.user as any).findFirst.mockResolvedValue(null);

      // --- ACT ---
      await repo.findFirst();

      // --- ASSERT --- no where, no include — empty object.
      expect((prisma.user as any).findFirst).toHaveBeenCalledWith({});
    });

    it('should forward where + include when provided', async () => {
      // --- ARRANGE ---
      (prisma.user as any).findFirst.mockResolvedValue({ id: 'u1' });

      // --- ACT ---
      await repo.findFirst({ name: 'A' }, { departments: true });

      // --- ASSERT ---
      expect((prisma.user as any).findFirst).toHaveBeenCalledWith({
        where: { name: 'A' },
        include: { departments: true },
      });
    });
  });

  describe('findMany', () => {
    it('should forward where, orderBy, and include', async () => {
      // --- ARRANGE ---
      (prisma.user as any).findMany.mockResolvedValue([{ id: 'u1' }]);

      // --- ACT ---
      const out = await repo.findMany({ name: 'A' }, { name: 'asc' }, { departments: true });

      // --- ASSERT ---
      expect(out).toEqual([{ id: 'u1' }]);
      expect((prisma.user as any).findMany).toHaveBeenCalledWith({
        where: { name: 'A' },
        orderBy: { name: 'asc' },
        include: { departments: true },
      });
    });
  });

  describe('findManyPaginated', () => {
    it('should compute skip/take from page and limit and return meta', async () => {
      // --- ARRANGE --- 25 rows total, page 2 limit 10 → skip 10, take 10.
      (prisma.user as any).findMany.mockResolvedValue([{ id: 'u11' }]);
      (prisma.user as any).count.mockResolvedValue(25);

      // --- ACT ---
      const result = await repo.findManyPaginated({ page: 2, limit: 10 });

      // --- ASSERT ---
      expect((prisma.user as any).findMany).toHaveBeenCalledWith({ skip: 10, take: 10 });
      expect(result.data).toEqual([{ id: 'u11' }]);
      expect(result.meta).toEqual({
        total: 25,
        page: 2,
        limit: 10,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: true,
      });
    });

    it('should clamp limit to MAX_PAGE_LIMIT (100) when the caller asks for more', async () => {
      // --- ARRANGE ---
      (prisma.user as any).findMany.mockResolvedValue([]);
      (prisma.user as any).count.mockResolvedValue(0);

      // --- ACT ---
      const result = await repo.findManyPaginated({ page: 1, limit: 9999 });

      // --- ASSERT ---
      expect((prisma.user as any).findMany).toHaveBeenCalledWith({ skip: 0, take: 100 });
      expect(result.meta.limit).toBe(100);
      expect(result.meta.totalPages).toBe(0);
      expect(result.meta.hasNextPage).toBe(false);
      expect(result.meta.hasPreviousPage).toBe(false);
    });

    it('should coerce page<1 to 1 and limit<1 to 1', async () => {
      // --- ARRANGE ---
      (prisma.user as any).findMany.mockResolvedValue([]);
      (prisma.user as any).count.mockResolvedValue(0);

      // --- ACT ---
      await repo.findManyPaginated({ page: 0, limit: 0 });

      // --- ASSERT ---
      expect((prisma.user as any).findMany).toHaveBeenCalledWith({ skip: 0, take: 1 });
    });

    it('should forward where + include to both findMany and count', async () => {
      // --- ARRANGE ---
      (prisma.user as any).findMany.mockResolvedValue([{ id: 'u1' }]);
      (prisma.user as any).count.mockResolvedValue(1);

      // --- ACT ---
      await repo.findManyPaginated({ page: 1, limit: 10 }, { name: 'A' }, { departments: true });

      // --- ASSERT ---
      expect((prisma.user as any).findMany).toHaveBeenCalledWith({
        where: { name: 'A' },
        skip: 0,
        take: 10,
        include: { departments: true },
      });
      expect((prisma.user as any).count).toHaveBeenCalledWith({ where: { name: 'A' } });
    });
  });

  describe('update', () => {
    it('should call delegate with where + data', async () => {
      // --- ARRANGE ---
      (prisma.user as any).update.mockResolvedValue({ id: 'u1' });

      // --- ACT ---
      await repo.update({ id: 'u1' }, { name: 'B' });

      // --- ASSERT ---
      expect((prisma.user as any).update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { name: 'B' },
      });
    });
  });

  describe('delete', () => {
    it('should call delegate with just a where', async () => {
      // --- ARRANGE ---
      (prisma.user as any).delete.mockResolvedValue({ id: 'u1' });

      // --- ACT ---
      await repo.delete({ id: 'u1' });

      // --- ASSERT ---
      expect((prisma.user as any).delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
    });
  });

  describe('softDelete', () => {
    it('should update the record with deletedAt set to a Date', async () => {
      // --- ARRANGE ---
      (prisma.user as any).update.mockResolvedValue({ id: 'u1' });

      // --- ACT ---
      await repo.softDelete({ id: 'u1' });

      // --- ASSERT ---
      const call = (prisma.user as any).update.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'u1' });
      expect(call.data.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('restore', () => {
    it('should update the record with deletedAt set to null', async () => {
      // --- ARRANGE ---
      (prisma.user as any).update.mockResolvedValue({ id: 'u1' });

      // --- ACT ---
      await repo.restore({ id: 'u1' });

      // --- ASSERT ---
      expect((prisma.user as any).update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { deletedAt: null },
      });
    });
  });

  describe('count', () => {
    it('should forward where when supplied', async () => {
      // --- ARRANGE ---
      (prisma.user as any).count.mockResolvedValue(7);

      // --- ACT ---
      const n = await repo.count({ name: 'A' });

      // --- ASSERT ---
      expect(n).toBe(7);
      expect((prisma.user as any).count).toHaveBeenCalledWith({ where: { name: 'A' } });
    });

    it('should call count with an empty object when no where is supplied', async () => {
      // --- ARRANGE ---
      (prisma.user as any).count.mockResolvedValue(0);

      // --- ACT ---
      await repo.count();

      // --- ASSERT ---
      expect((prisma.user as any).count).toHaveBeenCalledWith({});
    });
  });

  describe('exists', () => {
    it('should return true when count > 0', async () => {
      // --- ARRANGE ---
      (prisma.user as any).count.mockResolvedValue(1);

      // --- ACT + ASSERT ---
      await expect(repo.exists({ id: 'u1' })).resolves.toBe(true);
    });

    it('should return false when count === 0', async () => {
      // --- ARRANGE ---
      (prisma.user as any).count.mockResolvedValue(0);

      // --- ACT + ASSERT ---
      await expect(repo.exists({ id: 'missing' })).resolves.toBe(false);
    });
  });

  describe('withTransaction', () => {
    it('should forward to prisma.$transaction with the default 10s timeout', async () => {
      // --- ARRANGE ---
      const cb = jest.fn(async () => 'result');

      // --- ACT ---
      const out = await repo.withTransaction(cb);

      // --- ASSERT ---
      expect(out).toBe('result');
      expect((prisma as any).$transaction).toHaveBeenCalledWith(cb, { timeout: 10000 });
    });

    it('should allow overriding the timeout', async () => {
      // --- ARRANGE ---
      const cb = jest.fn(async () => 42);

      // --- ACT ---
      await repo.withTransaction(cb, { timeout: 5000 });

      // --- ASSERT ---
      expect((prisma as any).$transaction).toHaveBeenCalledWith(cb, { timeout: 5000 });
    });
  });
});
