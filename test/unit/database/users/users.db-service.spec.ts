/**
 * UsersDbService — thin facade over UsersDbRepository. We verify it
 * forwards to the repository verbatim (including the tx client).
 * The primary consumer is MockAuthMiddleware, which calls `findAuthContext`.
 */
import { UsersDbService } from '@database/users/users.db-service';

describe('UsersDbService', () => {
  const repo = { findAuthContext: jest.fn() } as any;
  const service = new UsersDbService(repo);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findAuthContext', () => {
    it('should delegate to the repository and return its result', async () => {
      // --- ARRANGE ---
      const ctx = {
        id: 'u1',
        companyId: 'c1',
        email: 'a@b',
        name: 'Alice',
        departmentIds: ['d1'],
      };
      repo.findAuthContext.mockResolvedValueOnce(ctx);

      // --- ACT ---
      const out = await service.findAuthContext('u1');

      // --- ASSERT ---
      expect(out).toBe(ctx);
      expect(repo.findAuthContext).toHaveBeenCalledWith('u1', undefined);
    });

    it('should propagate a null result (user not found)', async () => {
      // --- ARRANGE ---
      repo.findAuthContext.mockResolvedValueOnce(null);

      // --- ACT ---
      const out = await service.findAuthContext('ghost');

      // --- ASSERT ---
      expect(out).toBeNull();
    });

    it('should thread the tx client through to the repo', async () => {
      // --- ARRANGE ---
      const tx = { marker: true } as any;
      repo.findAuthContext.mockResolvedValueOnce(null);

      // --- ACT ---
      await service.findAuthContext('u1', tx);

      // --- ASSERT ---
      expect(repo.findAuthContext).toHaveBeenCalledWith('u1', tx);
    });
  });
});
