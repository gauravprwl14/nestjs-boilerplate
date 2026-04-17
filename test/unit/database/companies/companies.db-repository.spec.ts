/**
 * CompaniesDbRepository — Company IS the tenant record, so reads use the
 * plain (un-extended) Prisma client. The repository exposes `findById`
 * plus the inherited BaseRepository CRUD.
 */
import { CompaniesDbRepository } from '@database/companies/companies.db-repository';
import { PrismaService } from '@database/prisma.service';
import { createMockPrisma } from '../../../helpers/mock-prisma';

describe('CompaniesDbRepository', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let repo: CompaniesDbRepository;

  beforeEach(() => {
    prisma = createMockPrisma();
    repo = new CompaniesDbRepository(prisma as unknown as PrismaService);
  });

  describe('findById', () => {
    it('should call company.findUnique with { where: { id } }', async () => {
      // --- ARRANGE ---
      (prisma.company as any).findUnique.mockResolvedValue({ id: 'c1', name: 'Acme' });

      // --- ACT ---
      const out = await repo.findById('c1');

      // --- ASSERT ---
      expect(out).toEqual({ id: 'c1', name: 'Acme' });
      expect((prisma.company as any).findUnique).toHaveBeenCalledWith({ where: { id: 'c1' } });
    });

    it('should return null when the company does not exist', async () => {
      // --- ARRANGE ---
      (prisma.company as any).findUnique.mockResolvedValue(null);

      // --- ACT + ASSERT ---
      await expect(repo.findById('missing')).resolves.toBeNull();
    });

    it('should use the tx client when provided', async () => {
      // --- ARRANGE ---
      const tx = {
        company: { findUnique: jest.fn().mockResolvedValue({ id: 'c1' }) },
      } as any;

      // --- ACT ---
      await repo.findById('c1', tx);

      // --- ASSERT ---
      expect(tx.company.findUnique).toHaveBeenCalledWith({ where: { id: 'c1' } });
      expect((prisma.company as any).findUnique).not.toHaveBeenCalled();
    });
  });
});
