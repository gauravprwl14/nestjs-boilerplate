import { Injectable } from '@nestjs/common';
import { MultiDbService } from '@database/multi-db.service';
import { ArchiveRegistryService } from '@database/archive-registry.service';

interface DbSizeRow {
  size_bytes: string;
  size_mb: string;
  order_count: string;
}

@Injectable()
export class ArchivalDbRepository {
  constructor(
    private readonly db: MultiDbService,
    private readonly registry: ArchiveRegistryService,
  ) {}

  /**
   * Query pg_database_size() from primary, metadata, and each cold archive.
   *
   * @returns Object with primary, metadataArchive, and coldArchives fields
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
   * Return COUNT from orders_recent and a tier distribution from user_order_index.
   *
   * @returns Object with hotOrders count and tierDistribution array
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
   * Return the registry config for a given year's cold archive.
   *
   * @param year - The archive year to look up
   * @returns Archive config fields or an error object if not found
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

  /**
   * Move the oldest N hot orders (older than 90 days) from orders_recent into
   * order_metadata_archive using a dual-transaction approach.
   *
   * Steps:
   *   1. Fetch oldest N candidates WHERE created_at < NOW() - INTERVAL '90 days'
   *   2. BEGIN on both primary and metadata clients
   *   3. Bulk INSERT into order_metadata_archive via unnest
   *   4. UPDATE user_order_index SET tier=3
   *   5. DELETE FROM orders_recent (CASCADE removes order_items_recent)
   *   6. INSERT into partition_simulation log
   *   7. COMMIT both; ROLLBACK on error
   *
   * @param batchSize - Number of orders to rotate per call (default 1000)
   * @returns Summary of the rotation operation
   */
  async simulateRotation(batchSize: number): Promise<Record<string, unknown>> {
    const primaryPool = this.db.getPrimaryPool();
    const metadataPool = this.db.getMetadataPool();

    const candidatesRes = await primaryPool.query<{
      order_id: bigint;
      user_id: bigint;
      order_number: string;
      total_amount: string;
      status: string;
      payment_method: string;
      created_at: Date;
    }>(
      `SELECT order_id, user_id, order_number, total_amount, status, payment_method, created_at
       FROM orders_recent
       WHERE created_at < NOW() - INTERVAL '90 days'
       ORDER BY created_at ASC
       LIMIT $1`,
      [batchSize],
    );

    if (candidatesRes.rows.length === 0) {
      return { message: 'No orders eligible for rotation (all within 90 days)', recordsMoved: 0 };
    }

    const orderIds = candidatesRes.rows.map(r => r.order_id);

    const primaryClient = await primaryPool.connect();
    const metadataClient = await metadataPool.connect();

    try {
      await primaryClient.query('BEGIN');
      await metadataClient.query('BEGIN');

      await metadataClient.query(
        `INSERT INTO order_metadata_archive
           (order_id, user_id, order_number, total_amount, status, payment_method, created_at, archive_location)
         SELECT order_id, user_id, order_number, total_amount, status, payment_method, created_at, 'metadata_archive_db'
         FROM unnest($1::bigint[], $2::bigint[], $3::text[], $4::numeric[], $5::text[], $6::text[], $7::timestamp[])
           AS t(order_id, user_id, order_number, total_amount, status, payment_method, created_at)
         ON CONFLICT (order_id) DO NOTHING`,
        [
          candidatesRes.rows.map(r => r.order_id),
          candidatesRes.rows.map(r => r.user_id),
          candidatesRes.rows.map(r => r.order_number),
          candidatesRes.rows.map(r => r.total_amount),
          candidatesRes.rows.map(r => r.status),
          candidatesRes.rows.map(r => r.payment_method),
          candidatesRes.rows.map(r => r.created_at),
        ],
      );

      await primaryClient.query(
        `UPDATE user_order_index SET tier = 3, archive_location = 'metadata_archive_db'
         WHERE order_id = ANY($1)`,
        [orderIds],
      );

      await primaryClient.query('DELETE FROM orders_recent WHERE order_id = ANY($1)', [orderIds]);

      await primaryClient.query(
        `INSERT INTO partition_simulation (partition_date, is_rotated, rotated_at, records_moved)
         VALUES (CURRENT_DATE, true, NOW(), $1)`,
        [candidatesRes.rows.length],
      );

      await primaryClient.query('COMMIT');
      await metadataClient.query('COMMIT');

      return {
        message: `Rotated ${candidatesRes.rows.length} orders from hot → warm tier`,
        movedFrom: 'orders_recent',
        movedTo: 'order_metadata_archive',
        recordsMoved: candidatesRes.rows.length,
      };
    } catch (err) {
      await primaryClient.query('ROLLBACK');
      await metadataClient.query('ROLLBACK');
      throw err;
    } finally {
      primaryClient.release();
      metadataClient.release();
    }
  }
}
