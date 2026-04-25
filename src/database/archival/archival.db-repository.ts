import { Injectable } from '@nestjs/common';
import { MultiDbService } from '@database/multi-db.service';
import { ArchiveRegistryService } from '@database/archive-registry.service';

/**
 * Internal shape for pg_database_size() query results used only within this repository.
 * Numeric values arrive as strings from the pg driver and are not parsed here —
 * callers receive them as-is for diagnostic/display purposes.
 */
interface DbSizeRow {
  /** Raw byte count returned by pg_database_size(), cast to text */
  size_bytes: string;
  /** Size in megabytes rounded to 2 decimal places, cast to text */
  size_mb: string;
  /** String-encoded COUNT(*) of the primary table for each tier */
  order_count: string;
}

/**
 * Raw SQL repository for archival-plane diagnostics and partition rotation.
 *
 * This repository is the only place that issues cross-tier queries spanning the
 * primary, metadata, and cold archive pools simultaneously.  Methods here tend to
 * be heavier than the order-serving queries and should not be placed in hot paths.
 *
 * Injected into ArchivalDbService — feature controllers must not depend on this
 * class directly.
 */
@Injectable()
export class ArchivalDbRepository {
  constructor(
    private readonly db: MultiDbService,
    private readonly registry: ArchiveRegistryService,
  ) {}

  /**
   * Queries `pg_database_size()` on the primary, the metadata server, and every
   * active cold-archive database registered in the ArchiveRegistryService.
   *
   * This is intentionally heavy — it serialises queries across N cold archive
   * pools and should only be called from admin/diagnostic endpoints, never from
   * the order-serving hot path.
   *
   * @returns Structured object with primary, metadataArchive, and coldArchives size info
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
   * Returns a lightweight operational snapshot: the live hot-order count from
   * `orders_recent` and the tier distribution from `user_order_index`.
   *
   * Both queries run in parallel against the read replica, making this safe to
   * call from monitoring or health-check endpoints without stressing the primary.
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
   * Returns metadata about the cold-tier (tier 4) archive database registered
   * for the given calendar year, or an error descriptor if none is configured.
   *
   * This is a pure registry lookup — no DB query is issued.
   *
   * @param year - The archive calendar year to look up (e.g. 2022, 2023)
   * @returns Connection metadata object, or an object with an `error` key if no cold archive exists
   */
  async getArchiveForYear(year: number): Promise<Record<string, unknown>> {
    const cfg = this.registry.getArchiveForYear(year, 4);
    if (!cfg) return { error: `No cold archive found for year ${year}` };
    return { databaseName: cfg.databaseName, host: cfg.host, port: cfg.port, tier: cfg.tier };
  }

  /**
   * Simulates a hot→warm partition rotation for orders older than 90 days.
   *
   * The rotation is a dual-transaction operation to maintain consistency across
   * two separate Postgres servers (primary and metadata):
   * 1. Candidates are selected from `orders_recent` on the primary (no transaction yet).
   * 2. BEGIN is issued on both primary and metadata clients simultaneously.
   * 3. Rows are INSERT'd into `order_metadata_archive` on metadata (ON CONFLICT DO NOTHING
   *    guards against re-running with overlapping batches).
   * 4. `user_order_index` is updated to tier=3 and `orders_recent` rows are DELETEd on primary.
   * 5. A `partition_simulation` audit row is written on primary.
   * 6. Both transactions are COMMITted.  On any error, both are ROLLBACKed before re-throwing.
   *
   * Note: The dual-commit is NOT two-phase commit (2PC) — a crash between the two
   * COMMITs would leave the data in an inconsistent state.  This is a simulation
   * intended to demonstrate the rotation logic, not a production-safe implementation.
   *
   * @param batchSize - Maximum number of orders to rotate in a single call (defaults to 1000 via service)
   * @returns Summary object with message, source/destination table names, and recordsMoved count
   * @throws If either database transaction fails — both sides are rolled back before throwing
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
       FROM orders_recent WHERE created_at < NOW() - INTERVAL '90 days'
       ORDER BY created_at ASC LIMIT $1`,
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
        `UPDATE user_order_index SET tier = 3, archive_location = 'metadata_archive_db' WHERE order_id = ANY($1)`,
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
