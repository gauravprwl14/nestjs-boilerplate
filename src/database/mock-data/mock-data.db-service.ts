import { Injectable } from '@nestjs/common';
import { MockDataDbRepository } from './mock-data.db-repository';

/**
 * DB-layer façade over MockDataDbRepository.
 *
 * Exposes cross-tier status and hot-order count queries to the mock-data feature
 * module without leaking repository internals.
 */
@Injectable()
export class MockDataDbService {
  constructor(private readonly repo: MockDataDbRepository) {}

  /**
   * Returns a full cross-tier data-distribution snapshot (hot / warm / cold / index).
   * Intended for admin/development endpoints — not safe for high-frequency calls.
   */
  getStatus(): Promise<Record<string, unknown>> {
    return this.repo.getStatus();
  }

  /**
   * Returns the live row count of orders_recent, sourced from the primary to
   * avoid replica lag.  Used by seed logic to detect whether data already exists.
   */
  getHotOrderCount(): Promise<number> {
    return this.repo.getHotOrderCount();
  }
}
