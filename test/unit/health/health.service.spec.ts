import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from '@modules/health/health.service';
import { PrismaService } from '@database/prisma.service';
import { createMockPrisma } from '../../helpers/mock-prisma';
import { AppError } from '@errors/types/app-error';

describe('HealthService', () => {
  let service: HealthService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    mockPrisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  describe('isAlive()', () => {
    it('should return status ok', () => {
      // --- ARRANGE (nothing) ---

      // --- ACT ---
      const result = service.isAlive();

      // --- ASSERT ---
      expect(result).toEqual({ status: 'ok' });
    });
  });

  describe('isReady()', () => {
    it('should return status ready when database is healthy', async () => {
      // --- ARRANGE ---
      mockPrisma.isHealthy.mockResolvedValue(true);

      // --- ACT ---
      const result = await service.isReady();

      // --- ASSERT ---
      expect(result).toEqual({ status: 'ready' });
    });

    it('should throw AppError GEN0003 when database is unhealthy', async () => {
      // --- ARRANGE ---
      mockPrisma.isHealthy.mockResolvedValue(false);

      // --- ACT & ASSERT ---
      await expect(service.isReady()).rejects.toBeInstanceOf(AppError);
      await expect(service.isReady()).rejects.toMatchObject({
        code: 'GEN0003',
        statusCode: 503,
      });
    });
  });

  describe('getHealth()', () => {
    it('should return healthy status when database is up', async () => {
      // --- ARRANGE ---
      mockPrisma.isHealthy.mockResolvedValue(true);

      // --- ACT ---
      const result = await service.getHealth();

      // --- ASSERT ---
      expect(result.status).toBe('healthy');
      expect(result.components.database.status).toBe('healthy');
      expect(result.components.database.message).toBe('Connected');
      expect(result.uptime).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });

    it('should return unhealthy status when database is down', async () => {
      // --- ARRANGE ---
      mockPrisma.isHealthy.mockResolvedValue(false);

      // --- ACT ---
      const result = await service.getHealth();

      // --- ASSERT ---
      expect(result.status).toBe('unhealthy');
      expect(result.components.database.status).toBe('unhealthy');
      expect(result.components.database.message).toBe('Unreachable');
    });

    it('should include latency for database component', async () => {
      // --- ARRANGE ---
      mockPrisma.isHealthy.mockResolvedValue(true);

      // --- ACT ---
      const result = await service.getHealth();

      // --- ASSERT ---
      expect(result.components.database.latencyMs).toBeDefined();
      expect(typeof result.components.database.latencyMs).toBe('number');
    });

    it('should include a valid ISO timestamp', async () => {
      // --- ARRANGE ---
      mockPrisma.isHealthy.mockResolvedValue(true);

      // --- ACT ---
      const result = await service.getHealth();

      // --- ASSERT ---
      expect(() => new Date(result.timestamp)).not.toThrow();
      expect(isNaN(new Date(result.timestamp).getTime())).toBe(false);
    });
  });
});
