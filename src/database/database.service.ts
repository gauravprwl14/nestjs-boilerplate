import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { DbTransactionClient } from '@database/types';

/**
 * DB-layer boundary used by feature services to compose multiple db-service
 * calls atomically. Exposes runInTransaction and nothing else; all entity
 * queries belong on the per-aggregate *DbService classes.
 */
@Injectable()
export class DatabaseService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Runs `fn` inside a Prisma transaction. The DbTransactionClient passed to
   * the callback is the same type db-service methods accept as their `tx?`
   * parameter — feature code never imports from '@prisma/client' directly.
   *
   * @param fn - Callback receiving the tx client
   * @param options - Prisma transaction options (timeout, isolationLevel)
   */
  async runInTransaction<R>(
    fn: (tx: DbTransactionClient) => Promise<R>,
    options?: { timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<R> {
    return this.prisma.transaction(fn, options);
  }
}
