/**
 * UsersDbRepository — user lookups bypass tenant scoping (user identity is
 * resolved BEFORE CLS is populated) so we only mock the plain Prisma delegate.
 * `findAuthContext` shapes the row into the `{ id, companyId, email, name,
 * departmentIds }` contract consumed by MockAuthMiddleware.
 */
import { UsersDbRepository } from '@database/users/users.db-repository';
import { PrismaService } from '@database/prisma.service';
import { createMockPrisma } from '../../../helpers/mock-prisma';

describe('UsersDbRepository', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let repo: UsersDbRepository;

  beforeEach(() => {
    prisma = createMockPrisma();
    repo = new UsersDbRepository(prisma as unknown as PrismaService);
  });

  describe('findAuthContext', () => {
    it('should project the User row + pivot rows into a UserAuthContext', async () => {
      // --- ARRANGE ---
      (prisma.user as any).findUnique.mockResolvedValue({
        id: 'u1',
        companyId: 'c1',
        email: 'a@b',
        name: 'Alice',
        departments: [{ departmentId: 'd1' }, { departmentId: 'd2' }],
      });

      // --- ACT ---
      const result = await repo.findAuthContext('u1');

      // --- ASSERT ---
      expect(result).toEqual({
        id: 'u1',
        companyId: 'c1',
        email: 'a@b',
        name: 'Alice',
        departmentIds: ['d1', 'd2'],
      });
      expect((prisma.user as any).findUnique).toHaveBeenCalledWith({
        where: { id: 'u1' },
        include: { departments: { select: { departmentId: true } } },
      });
    });

    it('should return null when the user does not exist', async () => {
      // --- ARRANGE ---
      (prisma.user as any).findUnique.mockResolvedValue(null);

      // --- ACT ---
      const out = await repo.findAuthContext('ghost');

      // --- ASSERT ---
      expect(out).toBeNull();
    });

    it('should return empty departmentIds when the user has no memberships', async () => {
      // --- ARRANGE ---
      (prisma.user as any).findUnique.mockResolvedValue({
        id: 'u1',
        companyId: 'c1',
        email: 'a@b',
        name: 'Alice',
        departments: [],
      });

      // --- ACT ---
      const out = await repo.findAuthContext('u1');

      // --- ASSERT ---
      expect(out?.departmentIds).toEqual([]);
    });

    it('should use the tx client when supplied', async () => {
      // --- ARRANGE ---
      const tx = {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'u1',
            companyId: 'c1',
            email: 'a@b',
            name: 'Alice',
            departments: [{ departmentId: 'd1' }],
          }),
        },
      } as any;

      // --- ACT ---
      await repo.findAuthContext('u1', tx);

      // --- ASSERT ---
      expect(tx.user.findUnique).toHaveBeenCalled();
      expect((prisma.user as any).findUnique).not.toHaveBeenCalled();
    });
  });

  describe('BaseRepository delegation', () => {
    it('should route through prisma.user via delegateFor', async () => {
      // --- ARRANGE ---
      (prisma.user as any).create.mockResolvedValue({ id: 'u1' });

      // --- ACT ---
      await repo.create({ id: 'u1', name: 'A', email: 'a@b', companyId: 'c1' } as any);

      // --- ASSERT ---
      expect((prisma.user as any).create).toHaveBeenCalled();
    });
  });
});
