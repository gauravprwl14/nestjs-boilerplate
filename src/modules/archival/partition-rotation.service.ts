import { Injectable } from '@nestjs/common';
import { MultiDbService } from '@database/multi-db.service';
import { AppLogger } from '@logger/logger.service';

@Injectable()
export class PartitionRotationService {
  constructor(
    private readonly db: MultiDbService,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Simulate partition rotation by moving the oldest N hot orders (older than
   * 90 days) from orders_recent into order_metadata_archive.
   *
   * Steps:
   *   1. Fetch oldest N hot orders WHERE created_at < NOW() - INTERVAL '90 days'
   *   2. BEGIN on both primary and metadata clients
   *   3. INSERT into order_metadata_archive using unnest bulk insert
   *   4. UPDATE user_order_index SET tier=3, archive_location='metadata_archive_db'
   *   5. DELETE FROM orders_recent (CASCADE handles items)
   *   6. INSERT into partition_simulation
   *   7. COMMIT both; ROLLBACK on error
   *
   * @param batchSize - Number of orders to rotate per call (default 1000)
   * @returns Summary of the rotation operation
   */
  async simulateRotation(batchSize = 1000): Promise<Record<string, unknown>> {
    const primaryPool = this.db.getPrimaryPool();
    const metadataPool = this.db.getMetadataPool();

    // Fetch oldest hot orders beyond 90 days
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

      // Bulk insert into metadata archive via unnest
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

      // Update user_order_index tier
      await primaryClient.query(
        `UPDATE user_order_index SET tier = 3, archive_location = 'metadata_archive_db'
         WHERE order_id = ANY($1)`,
        [orderIds],
      );

      // Delete from hot table; CASCADE removes order_items_recent rows
      await primaryClient.query('DELETE FROM orders_recent WHERE order_id = ANY($1)', [orderIds]);

      // Record simulation run
      await primaryClient.query(
        `INSERT INTO partition_simulation (partition_date, is_rotated, rotated_at, records_moved)
         VALUES (CURRENT_DATE, true, NOW(), $1)`,
        [candidatesRes.rows.length],
      );

      await primaryClient.query('COMMIT');
      await metadataClient.query('COMMIT');

      this.logger.logEvent('partition.rotated', {
        attributes: { recordsMoved: candidatesRes.rows.length },
      });

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
