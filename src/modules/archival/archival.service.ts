import { Injectable } from '@nestjs/common';
import { ArchivalDbService } from '@database/archival/archival.db-service';

/**
 * Feature service for archival admin operations.
 *
 * Acts as a thin façade over {@link ArchivalDbService}. Business logic is
 * intentionally kept minimal here — the DB layer owns the raw SQL queries
 * against the metadata and cold-archive databases.
 */
@Injectable()
export class ArchivalService {
  constructor(private readonly archivalDb: ArchivalDbService) {}

  /**
   * Returns `pg_database_size()` for every registered DB instance: primary,
   * metadata (warm) archive, and each cold year-archive.
   *
   * @returns A map of instance label → size information as returned by the DB layer.
   */
  getDatabaseSizes(): Promise<Record<string, unknown>> {
    return this.archivalDb.getDatabaseSizes();
  }

  /**
   * Returns row counts per storage tier from `orders_recent` (hot) and
   * `user_order_index` (index across all tiers).
   *
   * Useful for at-a-glance monitoring of how data is distributed across tiers.
   *
   * @returns A map of tier label → row count and metadata as returned by the DB layer.
   */
  getStats(): Promise<Record<string, unknown>> {
    return this.archivalDb.getStats();
  }

  /**
   * Looks up the cold archive configuration registered for a specific calendar year.
   *
   * Each year's archive is a separate Postgres instance whose connection details
   * are stored in the metadata database. This method returns that config record.
   *
   * @param year - Four-digit calendar year (e.g. 2023).
   * @returns Archive config record including connection details and row counts,
   *          or an empty/null result when no archive exists for the given year.
   */
  getArchiveForYear(year: number): Promise<Record<string, unknown>> {
    return this.archivalDb.getArchiveForYear(year);
  }
}
