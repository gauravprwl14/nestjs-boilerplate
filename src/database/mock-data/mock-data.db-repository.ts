import { Injectable } from '@nestjs/common';
import { MultiDbService } from '@database/multi-db.service';
import { ArchiveRegistryService } from '@database/archive-registry.service';

@Injectable()
export class MockDataDbRepository {
  constructor(
    private readonly db: MultiDbService,
    private readonly registry: ArchiveRegistryService,
  ) {}

  /**
   * Query row counts across all storage tiers:
   *  - orders_recent (hot) via getReadPool()
   *  - order_metadata_archive (warm) via getMetadataPool()
   *  - archived_orders in each cold archive via getAllArchives()
   *  - tier distribution from user_order_index
   *
   * @returns Structured summary of data across all tiers
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

    const metaPool = this.db.getMetadataPool();
    const warm = await metaPool.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM order_metadata_archive',
    );

    const coldStats: Record<string, number> = {};
    for (const [_year, configs] of this.registry.getAllArchives()) {
      for (const cfg of configs) {
        if (cfg.tier !== 4) continue;
        const p = this.registry.getPoolForArchive(cfg);
        const r = await p.query<{ count: string }>('SELECT COUNT(*) AS count FROM archived_orders');
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
   * Return the count of rows in the hot orders table.
   *
   * @returns The number of rows in orders_recent
   */
  async getHotOrderCount(): Promise<number> {
    const pool = this.db.getReadPool();
    const result = await pool.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM orders_recent',
    );
    return parseInt(result.rows[0].count, 10);
  }
}
