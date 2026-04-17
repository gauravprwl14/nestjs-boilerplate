/**
 * DepartmentsDbService — thin facade over DepartmentsDbRepository.
 * Verify method signatures map 1:1 and tx is threaded through.
 */
import { DepartmentsDbService } from '@database/departments/departments.db-service';

describe('DepartmentsDbService', () => {
  const repo = {
    findManyByCompany: jest.fn(),
    findByIdInCompany: jest.fn(),
    findExistingIdsInCompany: jest.fn(),
    createDepartment: jest.fn(),
  } as any;
  const service = new DepartmentsDbService(repo);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findManyByCompany', () => {
    it('should forward (companyId, tx) to the repository', async () => {
      // --- ARRANGE ---
      repo.findManyByCompany.mockResolvedValueOnce([{ id: 'd1' }]);

      // --- ACT ---
      const out = await service.findManyByCompany('c1');

      // --- ASSERT ---
      expect(out).toEqual([{ id: 'd1' }]);
      expect(repo.findManyByCompany).toHaveBeenCalledWith('c1', undefined);
    });
  });

  describe('findByIdInCompany', () => {
    it('should forward (id, companyId, tx) to the repository', async () => {
      // --- ARRANGE ---
      const tx = {} as any;
      repo.findByIdInCompany.mockResolvedValueOnce(null);

      // --- ACT ---
      await service.findByIdInCompany('d1', 'c1', tx);

      // --- ASSERT ---
      expect(repo.findByIdInCompany).toHaveBeenCalledWith('d1', 'c1', tx);
    });
  });

  describe('findExistingIdsInCompany', () => {
    it('should forward (ids, companyId, tx) to the repository', async () => {
      // --- ARRANGE ---
      repo.findExistingIdsInCompany.mockResolvedValueOnce(['d1']);

      // --- ACT ---
      const out = await service.findExistingIdsInCompany(['d1', 'd2'], 'c1');

      // --- ASSERT ---
      expect(out).toEqual(['d1']);
      expect(repo.findExistingIdsInCompany).toHaveBeenCalledWith(['d1', 'd2'], 'c1', undefined);
    });
  });

  describe('create', () => {
    it('should map service.create → repo.createDepartment (rename) with input + tx', async () => {
      // --- ARRANGE ---
      const dept = { id: 'd1', companyId: 'c1', name: 'Eng', parentId: null };
      repo.createDepartment.mockResolvedValueOnce(dept);
      const input = { companyId: 'c1', parentId: null, name: 'Eng' };

      // --- ACT ---
      const out = await service.create(input);

      // --- ASSERT ---
      expect(out).toBe(dept);
      expect(repo.createDepartment).toHaveBeenCalledWith(input, undefined);
    });

    it('should forward a supplied tx client', async () => {
      // --- ARRANGE ---
      const tx = { marker: true } as any;
      repo.createDepartment.mockResolvedValueOnce({});
      const input = { companyId: 'c1', parentId: 'd-root', name: 'Backend' };

      // --- ACT ---
      await service.create(input, tx);

      // --- ASSERT ---
      expect(repo.createDepartment).toHaveBeenCalledWith(input, tx);
    });
  });
});
