import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { AppLogger } from '@logger/logger.service';
import { AppConfigService } from '@config/config.service';

/**
 * PrismaService — used ONLY for schema migrations on the primary DB.
 * Runtime queries go through MultiDbService (raw pg pools).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly logger: AppLogger,
    private readonly config: AppConfigService,
  ) {
    const pool = new pg.Pool({ connectionString: config.database.url });
    const adapter = new PrismaPg(pool);
    super({ adapter });
    this.logger.setContext(PrismaService.name);
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.logEvent('database.connected', { attributes: { provider: 'postgresql' } });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.logEvent('database.disconnected');
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
