import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppLogger } from '@logger/logger.service';
import { AppConfigService } from '@config/config.service';

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
      attributes: { provider: 'postgresql' },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();

    this.logger.logEvent('database.disconnected');
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

  /**
   * Execute operations within a database transaction.
   *
   * Feature services should prefer `DatabaseService.runInTransaction()`,
   * which exposes the transaction client as `DbTransactionClient` and keeps
   * `Prisma.*` types confined to `src/database/`. This method exists so
   * `DatabaseService` (and other db-layer helpers) have a thin wrapper over
   * Prisma's `$transaction` with the same options surface.
   *
   * @param fn - Callback receiving the transaction client
   * @param options - Transaction options
   * @param options.timeout - Transaction timeout in milliseconds
   * @param options.isolationLevel - Database isolation level
   * @returns Result of the callback
   */
  async transaction<R>(
    fn: (tx: Prisma.TransactionClient) => Promise<R>,
    options?: { timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<R> {
    return this.$transaction(fn, options);
  }
}
