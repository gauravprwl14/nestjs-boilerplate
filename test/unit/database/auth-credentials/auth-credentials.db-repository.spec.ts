import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeyStatus } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { AuthCredentialsDbRepository } from '@database/auth-credentials/auth-credentials.db-repository';
import { createMockPrisma } from '../../../helpers/mock-prisma';

describe('AuthCredentialsDbRepository', () => {
  let repo: AuthCredentialsDbRepository;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthCredentialsDbRepository, { provide: PrismaService, useValue: prisma }],
    }).compile();
    repo = module.get(AuthCredentialsDbRepository);
  });

  describe('refresh tokens', () => {
    it('issueRefreshToken creates with token/userId/expiresAt', async () => {
      const exp = new Date('2026-05-01');
      prisma.refreshToken.create.mockResolvedValue({ id: 'rt1' });
      await repo.issueRefreshToken({ token: 't', userId: 'u1', expiresAt: exp });
      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: { token: 't', userId: 'u1', expiresAt: exp },
      });
    });

    it('findRefreshTokenByValueWithUser queries by token and includes user', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({ id: 'rt1', user: { id: 'u1' } });
      await repo.findRefreshTokenByValueWithUser('tok');
      expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith({
        where: { token: 'tok' },
        include: { user: true },
      });
    });

    it('revokeRefreshToken sets revokedAt', async () => {
      prisma.refreshToken.update.mockResolvedValue({ id: 'rt1' });
      await repo.revokeRefreshToken('rt1');
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt1' },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('revokeAllActiveRefreshTokensForUser filters by userId and revokedAt null', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });
      const r = await repo.revokeAllActiveRefreshTokensForUser('u1');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(r).toEqual({ count: 2 });
    });
  });

  describe('api keys', () => {
    it('createApiKey creates with userId and ACTIVE status', async () => {
      prisma.apiKey.create.mockResolvedValue({ id: 'k1' });
      await repo.createApiKey('u1', { name: 'n', keyHash: 'h', prefix: 'p', expiresAt: null });
      expect(prisma.apiKey.create).toHaveBeenCalledWith({
        data: {
          name: 'n',
          keyHash: 'h',
          prefix: 'p',
          userId: 'u1',
          status: ApiKeyStatus.ACTIVE,
          expiresAt: null,
        },
      });
    });

    it('findApiKeysByUserId selects the list projection and orders by createdAt desc', async () => {
      prisma.apiKey.findMany.mockResolvedValue([]);
      await repo.findApiKeysByUserId('u1');
      expect(prisma.apiKey.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        select: {
          id: true,
          name: true,
          prefix: true,
          status: true,
          lastUsedAt: true,
          expiresAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('findApiKeyByIdForUser queries by id+userId', async () => {
      prisma.apiKey.findFirst.mockResolvedValue(null);
      await repo.findApiKeyByIdForUser('u1', 'k1');
      expect(prisma.apiKey.findFirst).toHaveBeenCalledWith({
        where: { id: 'k1', userId: 'u1' },
      });
    });

    it('revokeApiKey sets status to REVOKED', async () => {
      prisma.apiKey.update.mockResolvedValue({ id: 'k1' });
      await repo.revokeApiKey('k1');
      expect(prisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: 'k1' },
        data: { status: ApiKeyStatus.REVOKED },
      });
    });
  });
});
