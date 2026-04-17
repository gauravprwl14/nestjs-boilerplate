import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@database/prisma.service';
import { DatabaseService } from '@database/database.service';

describe('DatabaseService', () => {
  let service: DatabaseService;
  let prisma: { transaction: jest.Mock };

  beforeEach(async () => {
    prisma = { transaction: jest.fn().mockImplementation(cb => cb('tx-client')) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [DatabaseService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(DatabaseService);
  });

  describe('runInTransaction', () => {
    it('should delegate to PrismaService.transaction and pass the tx client to the callback', async () => {
      // Arrange
      const cb = jest.fn().mockResolvedValue('result');

      // Act
      const result = await service.runInTransaction(cb);

      // Assert
      expect(prisma.transaction).toHaveBeenCalledWith(cb, undefined);
      expect(cb).toHaveBeenCalledWith('tx-client');
      expect(result).toBe('result');
    });

    it('should forward transaction options', async () => {
      // Arrange
      const cb = jest.fn().mockResolvedValue('ok');
      const options = { timeout: 5000 };

      // Act
      await service.runInTransaction(cb, options);

      // Assert
      expect(prisma.transaction).toHaveBeenCalledWith(cb, options);
    });
  });
});
