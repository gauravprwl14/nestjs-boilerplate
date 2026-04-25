import { Injectable } from '@nestjs/common';
import { ArchivalDbService } from '@database/archival/archival.db-service';
import { AppLogger } from '@logger/logger.service';

/**
 * Feature service wrapping the hot→warm partition rotation operation.
 *
 * This service adds structured logging around the DB-layer rotation call.
 * The rotation itself is a simulation: it moves orders older than 90 days
 * from the hot tier (`orders_recent`) into the warm metadata archive tier,
 * updating `user_order_index` accordingly.
 */
@Injectable()
export class PartitionRotationService {
  constructor(
    private readonly archivalDb: ArchivalDbService,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Triggers a simulated hot→warm partition rotation for a batch of orders.
   *
   * Orders older than 90 days are moved from `orders_recent` (hot tier,
   * tier=2) into the warm metadata archive (tier=3). Item-level detail is
   * dropped during the move — only order metadata is retained in the warm tier.
   *
   * The event `partition.rotated` is logged only when at least one record is
   * moved, avoiding noise in steady-state (no-op) runs.
   *
   * @param batchSize - Maximum number of orders to rotate in a single call; defaults to 1000.
   * @returns Result object from the DB layer, typically `{ recordsMoved: number }`.
   */
  async simulateRotation(batchSize = 1000): Promise<Record<string, unknown>> {
    const result = await this.archivalDb.simulateRotation(batchSize);
    // Only emit the event when work was actually done to keep logs actionable
    if ((result as { recordsMoved: number }).recordsMoved > 0) {
      this.logger.logEvent('partition.rotated', {
        attributes: { recordsMoved: (result as { recordsMoved: number }).recordsMoved },
      });
    }
    return result;
  }
}
