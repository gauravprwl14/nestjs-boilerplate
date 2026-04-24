import { Injectable } from '@nestjs/common';
import { MultiDbService } from '@database/multi-db.service';
import { ArchiveRegistryService } from '@database/archive-registry.service';
import { AppLogger } from '@logger/logger.service';

interface DbSizeRow {
  size_bytes: string;
  size_mb: string;
  order_count: string;
}

@Injectable()
export class ArchivalService {
  constructor(
    private readonly db: MultiDbService,
    private readonly registry: ArchiveRegistryService,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Query pg_database_size() from primary, metadata, and each cold archive.
   * Returns {primary, metadataArchive, coldArchives[]}.
   */
  async getDatabaseSizes(): Promise<Record<string, unknown>> {
    const primary = await this.db.getPrimaryPool().query<DbSizeRow>(
      `SELECT pg_database_size(current_database())::text AS size_bytes,
              round(pg_database_size(current_database()) / 1048576.0, 2)::text AS size_mb,
              (SELECT COUNT(*)::text FROM orders_recent) AS order_count`,
    );

    const metadata = await this.db.getMetadataPool().query<DbSizeRow>(
      `SELECT pg_database_size(current_database())::text AS size_bytes,
              round(pg_database_size(current_database()) / 1048576.0, 2)::text AS size_mb,
              (SELECT COUNT(*)::text FROM order_metadata_archive) AS order_count`,
    );

    const archives: Record<string, unknown>[] = [];
    for (const [year, configs] of this.registry.getAllArchives()) {
      for (const cfg of configs) {
        if (cfg.tier !== 4) continue;
        const pool = this.registry.getPoolForArchive(cfg);
        const result = await pool.query<DbSizeRow>(
          `SELECT pg_database_size(current_database())::text AS size_bytes,
                  round(pg_database_size(current_database()) / 1048576.0, 2)::text AS size_mb,
                  (SELECT COUNT(*)::text FROM archived_orders) AS order_count`,
        );
        archives.push({
          name: cfg.databaseName,
          year,
          sizeMb: result.rows[0].size_mb,
          orderCount: result.rows[0].order_count,
          tier: 4,
        });
      }
    }

    return {
      primary: {
        sizeMb: primary.rows[0].size_mb,
        orderCount: primary.rows[0].order_count,
        tier: 2,
        tierName: 'hot',
      },
      metadataArchive: {
        sizeMb: metadata.rows[0].size_mb,
        orderCount: metadata.rows[0].order_count,
        tier: 3,
        tierName: 'warm',
      },
      coldArchives: archives,
    };
  }

  /**
   * Returns COUNT from orders_recent via read pool, and COUNT per tier
   * from user_order_index GROUP BY tier.
   */
  async getStats(): Promise<Record<string, unknown>> {
    const pool = this.db.getReadPool();
    const [hotCount, indexDist] = await Promise.all([
      pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM orders_recent'),
      pool.query<{ tier: number; count: string }>(
        'SELECT tier, COUNT(*) AS count FROM user_order_index GROUP BY tier ORDER BY tier',
      ),
    ]);

    return {
      hotOrders: parseInt(hotCount.rows[0].count, 10),
      tierDistribution: indexDist.rows.map(r => ({
        tier: r.tier,
        tierName: r.tier === 2 ? 'hot' : r.tier === 3 ? 'warm' : 'cold',
        count: parseInt(r.count, 10),
      })),
    };
  }

  /**
   * Returns the registry config for a given year's cold archive, or {error: ...}
   * if not found.
   *
   * @param year - The archive year to look up
   */
  async getArchiveForYear(year: number): Promise<Record<string, unknown>> {
    const cfg = this.registry.getArchiveForYear(year, 4);
    if (!cfg) return { error: `No cold archive found for year ${year}` };
    return {
      databaseName: cfg.databaseName,
      host: cfg.host,
      port: cfg.port,
      tier: cfg.tier,
    };
  }
}
