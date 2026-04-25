import { Injectable } from '@nestjs/common';
import { MultiDbService } from '@database/multi-db.service';
import { ArchiveRegistryService } from '@database/archive-registry.service';

/**
 * Repository for mock-data health and status queries spanning all storage tiers.
 *
 * Unlike the order-serving repositories, this class fans out to all tiers in a
 * single call to give a holistic view of the data distribution across hot, warm,
 * and cold storage.  It is intended for development/admin use only and should not
 * appear in production order-serving code paths.
 */
@Injectable()
export class MockDataDbRepository {
  constructor(
    private readonly db: MultiDbService,
    private readonly registry: ArchiveRegistryService,
  ) {}

  /**
   * Returns a cross-tier data-distribution snapshot: hot order count + date range,
   * warm archive count, cold archive counts per database, and the full tier
   * distribution from `user_order_index`.
   *
   * Hot and index queries run in parallel against the read replica; warm and cold
   * queries run sequentially after.  This is intentionally thorough — each cold
   * archive pool is queried individually, so response time grows with the number of
   * registered cold archives.  Do not expose this endpoint with low rate-limit budgets.
   *
   * @returns Structured status object with hot, warm, cold, and indexDistribution keys
   */
  async getStatus(): Promise<Record<string, unknown>> {
    const pool = this.db.getReadPool();
    const [hot, index] = await Promise.all([
      pool.query<{ count: string; min_date: Date; max_date: Date }>(
        'SELECT COUNT(*) AS count, MIN(created_at) AS min_date, MAX(created_at) AS max_date FROM orders_recent',
      ),
      pool.query<{ tier: number; count: string }>(
        'SELECT tier, COUNT(*) AS count FROM user_order_index GROUP BY tier ORDER BY tier',
      ),
    ]);

    const warm = await this.db
      .getMetadataPool()
      .query<{ count: string }>('SELECT COUNT(*) AS count FROM order_metadata_archive');

    const coldStats: Record<string, number> = {};
    for (const [_year, configs] of this.registry.getAllArchives()) {
      for (const cfg of configs) {
        if (cfg.tier !== 4) continue;
        const r = await this.registry
          .getPoolForArchive(cfg)
          .query<{ count: string }>('SELECT COUNT(*) AS count FROM archived_orders');
        coldStats[cfg.databaseName] = parseInt(r.rows[0].count, 10);
      }
    }

    return {
      hot: {
        orderCount: parseInt(hot.rows[0].count, 10),
        oldestOrder: hot.rows[0].min_date,
        newestOrder: hot.rows[0].max_date,
      },
      warm: { orderCount: parseInt(warm.rows[0].count, 10) },
      cold: coldStats,
      indexDistribution: index.rows.map(r => ({
        tier: r.tier,
        tierName: r.tier === 2 ? 'hot' : r.tier === 3 ? 'warm' : 'cold',
        count: parseInt(r.count, 10),
      })),
    };
  }

  /**
   * Returns the current row count of `orders_recent` from the primary pool.
   *
   * Reads from the primary (not a replica) to guarantee a non-stale count —
   * typically used to gate seed-data generation so it does not run twice.
   *
   * @returns Integer count of rows in orders_recent
   */
  async getHotOrderCount(): Promise<number> {
    const result = await this.db
      .getPrimaryPool()
      .query<{ count: string }>('SELECT COUNT(*) AS count FROM orders_recent');
    return parseInt(result.rows[0].count, 10);
  }
}
