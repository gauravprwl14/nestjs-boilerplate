import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ClsService } from 'nestjs-cls';
import { AppLogger } from '@logger/logger.service';
import { AppConfigService } from '@config/config.service';
import { tenantScopeExtension } from '@database/extensions/tenant-scope.extension';

/**
 * Prisma database service.
 *
 * Extends PrismaClient for the core connection; also exposes `tenantScoped`,
 * a client with the tenant-scope extension applied. Tenant-scoped repositories
 * (Department, UserDepartment, Tweet, TweetDepartment) read/write via
 * `tenantScoped`; non-tenant-scoped code (Company lookup, User auth resolution)
 * uses the plain client.
 *
 * Raw SQL (`$queryRaw`/`$executeRaw`) bypasses the extension — the timeline
 * query hard-codes the companyId filter to compensate.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private _tenantScoped?: ReturnType<PrismaService['buildTenantScoped']>;

  constructor(
    private readonly logger: AppLogger,
    private readonly config: AppConfigService,
    private readonly cls: ClsService,
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
   * Lazily-constructed Prisma client with the tenant-scope extension applied.
   * Use this from tenant-scoped repositories. Reads/writes flow through the
   * extension, so `companyId` is injected/asserted automatically.
   */
  get tenantScoped() {
    this._tenantScoped ??= this.buildTenantScoped();
    return this._tenantScoped;
  }

  private buildTenantScoped() {
    return this.$extends(tenantScopeExtension(this.cls));
  }

  /**
   * Execute operations within a database transaction. The callback receives the
   * TENANT-SCOPED transaction client, so tenant-scoped delegate access within
   * the transaction also flows through the extension.
   *
   * @param fn - Callback receiving the transaction client
   * @param options - Transaction options
   */
  async transaction<R>(
    fn: (tx: Prisma.TransactionClient) => Promise<R>,
    options?: { timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<R> {
    return (
      this.tenantScoped as unknown as {
        $transaction: (
          cb: (tx: Prisma.TransactionClient) => Promise<R>,
          opts?: typeof options,
        ) => Promise<R>;
      }
    ).$transaction(fn, options);
  }
}
