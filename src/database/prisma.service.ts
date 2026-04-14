import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppLogger } from '@logger/logger.service';
import { LogLevel } from '@logger/logger.interfaces';

/**
 * Prisma database service.
 *
 * Extends PrismaClient to integrate with NestJS lifecycle hooks and the
 * application logger. Handles connection management and health checks.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly logger: AppLogger) {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
    });

    this.logger.setContext(PrismaService.name);
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();

    this.logger.logEvent('database.connected', {
      level: LogLevel.INFO,
      attributes: { provider: 'postgresql' },
    });

    // Register query event listener
    (this.$on as Function)('query', (event: { query: string; duration: number }) => {
      this.logger.logEvent('database.query', {
        level: LogLevel.DEBUG,
        attributes: {
          query: event.query,
          duration: event.duration,
        },
      });
    });

    // Register error event listener
    (this.$on as Function)('error', (event: { message: string; target: string }) => {
      this.logger.logEvent('database.error', {
        level: LogLevel.ERROR,
        attributes: {
          message: event.message,
          target: event.target,
        },
      });
    });

    // Register warn event listener
    (this.$on as Function)('warn', (event: { message: string }) => {
      this.logger.logEvent('database.warn', {
        level: LogLevel.WARN,
        attributes: {
          message: event.message,
        },
      });
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
