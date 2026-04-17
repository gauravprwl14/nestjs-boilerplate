import { Test, TestingModule } from '@nestjs/testing';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { UsersDbRepository } from '@database/users/users.db-repository';
import { createMockPrisma } from '../../../helpers/mock-prisma';

describe('UsersDbRepository', () => {
  let repo: UsersDbRepository;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersDbRepository, { provide: PrismaService, useValue: prisma }],
    }).compile();
    repo = module.get(UsersDbRepository);
  });

  describe('findActiveByEmail', () => {
    it('should query by email and deletedAt: null', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u1', email: 'a@b.c' });

      const result = await repo.findActiveByEmail('a@b.c');

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { email: 'a@b.c', deletedAt: null },
      });
      expect(result).toEqual({ id: 'u1', email: 'a@b.c' });
    });
  });

  describe('findActiveById', () => {
    it('should query by id, deletedAt: null, status: ACTIVE', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u1' });

      await repo.findActiveById('u1');

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: 'u1', deletedAt: null, status: UserStatus.ACTIVE },
      });
    });
  });

  describe('recordFailedLogin', () => {
    it('should update failedLoginCount and lockedUntil', async () => {
      const locked = new Date('2026-04-17T12:00:00Z');
      prisma.user.update.mockResolvedValue({ id: 'u1' });

      await repo.recordFailedLogin('u1', { count: 3, lockedUntil: locked });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { failedLoginCount: 3, lockedUntil: locked },
      });
    });
  });

  describe('resetFailedLogin', () => {
    it('should zero failedLoginCount and null lockedUntil', async () => {
      prisma.user.update.mockResolvedValue({ id: 'u1' });

      await repo.resetFailedLogin('u1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
    });
  });
});
