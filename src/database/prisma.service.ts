import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppLogger } from '@logger/logger.service';
import { AppConfigService } from '@config/config.service';
import { LogLevel } from '@logger/logger.interfaces';

/**
 * Prisma database service.
 *
 * Uses Prisma v7 driver adapter pattern with connection string.
 * Extends PrismaClient to integrate with NestJS lifecycle hooks and the
 * application logger. Handles connection management and health checks.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly logger: AppLogger,
    private readonly config: AppConfigService,
  ) {
    const adapter = new PrismaPg(config.database.url);

    super({ adapter });

    this.logger.setContext(PrismaService.name);
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();

    this.logger.logEvent('database.connected', {
      level: LogLevel.INFO,
      attributes: { provider: 'postgresql' },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();

    this.logger.logEvent('database.disconnected', {
      level: LogLevel.INFO,
    });
  }

  /**
   * Checks database connectivity by running a simple SELECT 1 query.
   * @returns true if the database is reachable, false otherwise
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
