/**
 * DepartmentsDbRepository — tenant-scoped; delegateFor uses
 * `prisma.tenantScoped.department` when the active client is the PrismaService,
 * otherwise the tx client's own `department` delegate. Our mock prisma exposes
 * the same `department` shape under `tenantScoped` so the repo routes through it.
 */
import { DepartmentsDbRepository } from '@database/departments/departments.db-repository';
import { PrismaService } from '@database/prisma.service';
import { createMockPrisma } from '../../../helpers/mock-prisma';

/**
 * Builds a mock PrismaService whose `tenantScoped` property re-exports the same
 * department delegate — lets us assert calls against the mock directly.
 */
const buildPrisma = () => {
  const base = createMockPrisma();
  (base as any).tenantScoped = { department: base.department };
  return base;
};

describe('DepartmentsDbRepository', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let repo: DepartmentsDbRepository;

  beforeEach(() => {
    prisma = buildPrisma();
    repo = new DepartmentsDbRepository(prisma as unknown as PrismaService);
  });

  describe('findManyByCompany', () => {
    it('should query with companyId filter and name-asc ordering', async () => {
      // --- ARRANGE ---
      (prisma.department as any).findMany.mockResolvedValue([{ id: 'd1' }]);

      // --- ACT ---
      const out = await repo.findManyByCompany('c1');

      // --- ASSERT ---
      expect(out).toEqual([{ id: 'd1' }]);
      expect((prisma.department as any).findMany).toHaveBeenCalledWith({
        where: { companyId: 'c1' },
        orderBy: { name: 'asc' },
      });
    });

    it('should route through the tx client when one is supplied', async () => {
      // --- ARRANGE ---
      const tx = {
        department: { findMany: jest.fn().mockResolvedValue([]) },
      } as any;

      // --- ACT ---
      await repo.findManyByCompany('c1', tx);

      // --- ASSERT ---
      expect(tx.department.findMany).toHaveBeenCalled();
      expect((prisma.department as any).findMany).not.toHaveBeenCalled();
    });
  });

  describe('findByIdInCompany', () => {
    it('should findFirst with both id and companyId in the filter', async () => {
      // --- ARRANGE ---
      (prisma.department as any).findFirst.mockResolvedValue({ id: 'd1', companyId: 'c1' });

      // --- ACT ---
      const out = await repo.findByIdInCompany('d1', 'c1');

      // --- ASSERT ---
      expect(out).toEqual({ id: 'd1', companyId: 'c1' });
      expect((prisma.department as any).findFirst).toHaveBeenCalledWith({
        where: { id: 'd1', companyId: 'c1' },
      });
    });

    it('should return null for a cross-tenant / unknown id', async () => {
      // --- ARRANGE ---
      (prisma.department as any).findFirst.mockResolvedValue(null);

      // --- ACT + ASSERT ---
      await expect(repo.findByIdInCompany('d-other', 'c1')).resolves.toBeNull();
    });
  });

  describe('findExistingIdsInCompany', () => {
    it('should short-circuit and return [] when given an empty id list', async () => {
      // --- ACT ---
      const out = await repo.findExistingIdsInCompany([], 'c1');

      // --- ASSERT --- no Prisma call at all.
      expect(out).toEqual([]);
      expect((prisma.department as any).findMany).not.toHaveBeenCalled();
    });

    it('should return the intersection of requested ids and existing-in-company rows', async () => {
      // --- ARRANGE --- caller asked for 3, DB returned 2.
      (prisma.department as any).findMany.mockResolvedValue([{ id: 'd1' }, { id: 'd3' }]);

      // --- ACT ---
      const out = await repo.findExistingIdsInCompany(['d1', 'd2', 'd3'], 'c1');

      // --- ASSERT ---
      expect(out).toEqual(['d1', 'd3']);
      expect((prisma.department as any).findMany).toHaveBeenCalledWith({
        where: { id: { in: ['d1', 'd2', 'd3'] }, companyId: 'c1' },
        select: { id: true },
      });
    });
  });

  describe('createDepartment', () => {
    it('should call delegate.create with a flat {companyId, parentId, name} data payload', async () => {
      // --- ARRANGE ---
      (prisma.department as any).create.mockResolvedValue({ id: 'd1' });

      // --- ACT ---
      await repo.createDepartment({ companyId: 'c1', parentId: null, name: 'Eng' });

      // --- ASSERT ---
      expect((prisma.department as any).create).toHaveBeenCalledWith({
        data: { companyId: 'c1', parentId: null, name: 'Eng' },
      });
    });

    it('should forward parentId when present', async () => {
      // --- ARRANGE ---
      (prisma.department as any).create.mockResolvedValue({ id: 'd2' });

      // --- ACT ---
      await repo.createDepartment({ companyId: 'c1', parentId: 'd-root', name: 'Backend' });

      // --- ASSERT ---
      expect((prisma.department as any).create).toHaveBeenCalledWith({
        data: { companyId: 'c1', parentId: 'd-root', name: 'Backend' },
      });
    });

    it('should use the tx client when supplied', async () => {
      // --- ARRANGE ---
      const tx = {
        department: { create: jest.fn().mockResolvedValue({ id: 'd3' }) },
      } as any;

      // --- ACT ---
      await repo.createDepartment({ companyId: 'c1', parentId: null, name: 'Ops' }, tx);

      // --- ASSERT ---
      expect(tx.department.create).toHaveBeenCalled();
      expect((prisma.department as any).create).not.toHaveBeenCalled();
    });
  });
});
