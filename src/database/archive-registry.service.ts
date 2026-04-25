import { Injectable, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { MultiDbService } from '@database/multi-db.service';
import { AppLogger } from '@logger/logger.service';
import { ArchiveDbConfig } from '@database/interfaces';

/**
 * Loads and caches the `archive_databases` registry from the primary DB on startup.
 * Provides year-based routing helpers to obtain the correct pg.Pool for
 * warm (tier 3) and cold (tier 4) archive databases.
 *
 * The in-memory registry avoids hitting the primary on every request; it is
 * populated once via `onModuleInit` and can be manually refreshed by calling
 * `loadRegistry()` again (e.g. after a new archive year is provisioned).
 */
@Injectable()
export class ArchiveRegistryService implements OnModuleInit {
  /**
   * In-memory cache of archive_databases rows grouped by archiveYear.
   * A year may have multiple entries if both a warm (tier 3) and cold (tier 4)
   * archive exist for the same calendar year.
   */
  private registry = new Map<number, ArchiveDbConfig[]>();

  constructor(
    private readonly db: MultiDbService,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Triggers the initial registry load so that routing is available to all
   * other services by the time the application accepts requests.
   */
  async onModuleInit(): Promise<void> {
    await this.loadRegistry();
  }

  /**
   * (Re)loads the archive_databases table into the in-memory registry.
   * Clears the existing cache before loading.
   */
  async loadRegistry(): Promise<void> {
    const pool = this.db.getPrimaryPool();
    const result = await pool.query<ArchiveDbConfig>(
      `SELECT id, archive_year AS "archiveYear", database_name AS "databaseName",
              host, port, tier, is_active AS "isActive"
       FROM archive_databases WHERE is_active = true ORDER BY archive_year`,
    );
    this.registry.clear();
    for (const row of result.rows) {
      const year = row.archiveYear;
      if (!this.registry.has(year)) this.registry.set(year, []);
      this.registry.get(year)!.push(row);
    }
    this.logger.logEvent('archive-registry.loaded', {
      attributes: { entries: result.rowCount ?? 0 },
    });
  }

  /**
   * Returns the ArchiveDbConfig for the given year and tier, or undefined
   * if no matching active entry exists.
   *
   * @param year - The archive year (e.g. 2023, 2024)
   * @param tier - 3 for warm/metadata, 4 for cold
   * @returns Matching ArchiveDbConfig or undefined
   */
  getArchiveForYear(year: number, tier: 3 | 4): ArchiveDbConfig | undefined {
    return this.registry.get(year)?.find(a => a.tier === tier);
  }

  /**
   * Returns the pg.Pool for the given ArchiveDbConfig.
   *
   * @param cfg - Archive DB configuration
   * @returns pg.Pool instance (lazily created via MultiDbService)
   */
  getPoolForArchive(cfg: ArchiveDbConfig): Pool {
    return this.db.getArchivePool(cfg.host, cfg.port, cfg.databaseName);
  }

  /**
   * Convenience combo: resolves year+tier to a pool in one call.
   * Returns undefined if no active archive entry matches.
   *
   * @param year - Archive year
   * @param tier - Storage tier (3 or 4)
   * @returns pg.Pool or undefined
   */
  getPoolForYear(year: number, tier: 3 | 4): Pool | undefined {
    const cfg = this.getArchiveForYear(year, tier);
    return cfg ? this.getPoolForArchive(cfg) : undefined;
  }

  /**
   * Returns the full in-memory registry map (year → configs).
   *
   * @returns Map<number, ArchiveDbConfig[]>
   */
  getAllArchives(): Map<number, ArchiveDbConfig[]> {
    return this.registry;
  }
}
