/**
 * CompaniesDbService — thin facade; we just verify delegation to the repo.
 */
import { CompaniesDbService } from '@database/companies/companies.db-service';

describe('CompaniesDbService', () => {
  const repo = { findById: jest.fn() } as any;
  const service = new CompaniesDbService(repo);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findById', () => {
    it('should forward (id, tx) to the repository and return its result', async () => {
      // --- ARRANGE ---
      const company = { id: 'c1', name: 'Acme' };
      repo.findById.mockResolvedValueOnce(company);

      // --- ACT ---
      const out = await service.findById('c1');

      // --- ASSERT ---
      expect(out).toBe(company);
      expect(repo.findById).toHaveBeenCalledWith('c1', undefined);
    });

    it('should thread the tx client through', async () => {
      // --- ARRANGE ---
      const tx = { marker: true } as any;
      repo.findById.mockResolvedValueOnce(null);

      // --- ACT ---
      await service.findById('c1', tx);

      // --- ASSERT ---
      expect(repo.findById).toHaveBeenCalledWith('c1', tx);
    });

    it('should propagate null when the company is not found', async () => {
      // --- ARRANGE ---
      repo.findById.mockResolvedValueOnce(null);

      // --- ACT + ASSERT ---
      await expect(service.findById('missing')).resolves.toBeNull();
    });
  });
});
