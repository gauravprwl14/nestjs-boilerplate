import { Injectable } from '@nestjs/common';
import { MultiDbService } from '@database/multi-db.service';
import { ArchiveRegistryService } from '@database/archive-registry.service';
import { AppLogger } from '@logger/logger.delegate';

@Injectable()
export class MockDataService {
  constructor(
    private readonly db: MultiDbService,
    private readonly registry: ArchiveRegistryService,
    private readonly logger: AppLogger,
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
   * Check if hot orders table has data. If empty, return instructions to
   * restart containers (seeding happens via init-scripts at startup).
   *
   * @returns Status message indicating whether data exists or how to seed it
   */
  async generateIfEmpty(): Promise<Record<string, unknown>> {
    const pool = this.db.getPrimaryPool();
    const result = await pool.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM orders_recent',
    );
    const count = parseInt(result.rows[0].count, 10);

    if (count > 0) {
      return { message: 'Data already present — skipping generation', existingHotOrders: count };
    }

    this.logger.logEvent('mock-data.generation.started');

    // The generate_series SQL runs at DB init time via init-scripts.
    // This endpoint is for re-seeding if volumes are cleared.
    // For now, report status and instruct to restart containers.
    return {
      message:
        'Hot orders table is empty. Data is seeded via init-scripts at container start. Run: podman-compose down -v && podman-compose up -d',
      tip: 'The generate_series SQL in init-scripts/ seeds all tiers automatically on first startup.',
    };
  }
}
