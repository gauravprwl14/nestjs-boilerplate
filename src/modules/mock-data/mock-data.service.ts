import { Injectable } from '@nestjs/common';
import { MockDataDbService } from '@database/mock-data/mock-data.db-service';
import { AppLogger } from '@logger/logger.service';

/**
 * Feature service for data status checks and seeding instructions.
 *
 * Delegates status queries to {@link MockDataDbService}. Does not perform
 * actual data generation at runtime — seed data is injected by the
 * `init-scripts/` SQL run at container startup. When tables are empty this
 * service returns human-readable instructions on how to re-seed.
 */
@Injectable()
export class MockDataService {
  constructor(
    private readonly mockDataDb: MockDataDbService,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Returns the current data status across all storage tiers.
   *
   * Includes row counts and date-range metadata for `orders_recent` (hot),
   * the warm metadata archive, and registered cold year-archives.
   *
   * @returns Status map as returned by {@link MockDataDbService.getStatus}.
   */
  getStatus(): Promise<Record<string, unknown>> {
    return this.mockDataDb.getStatus();
  }

  /**
   * Checks whether hot-tier orders exist and, if not, returns instructions for
   * re-seeding the database via container restart.
   *
   * Actual data generation is performed by `init-scripts/` SQL at container
   * startup — this method intentionally does NOT generate data at runtime to
   * avoid accidental large inserts in a running service.
   *
   * @returns A message object: either a skip notice with the existing count,
   *          or seeding instructions when the hot table is empty.
   */
  async generateIfEmpty(): Promise<Record<string, unknown>> {
    const count = await this.mockDataDb.getHotOrderCount();
    if (count > 0) {
      // Data already present — nothing to do
      return { message: 'Data already present — skipping generation', existingHotOrders: count };
    }
    this.logger.logEvent('mock-data.generation.started');
    return {
      message:
        'Hot orders table is empty. Data is seeded via init-scripts at container start. Run: podman-compose down -v && podman-compose up -d',
      tip: 'The generate_series SQL in init-scripts/ seeds all tiers automatically on first startup.',
    };
  }
}
