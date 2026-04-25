import { Injectable } from '@nestjs/common';
import { ArchivalDbRepository } from './archival.db-repository';

/**
 * DB-layer façade over ArchivalDbRepository.
 *
 * Exposes archival diagnostics and partition rotation operations to the archival
 * feature module without leaking repository internals.  The default batchSize of
 * 1000 for simulateRotation is enforced here so that the repository stays generic.
 */
@Injectable()
export class ArchivalDbService {
  constructor(private readonly repo: ArchivalDbRepository) {}

  /**
   * Queries pg_database_size() across all tiers and returns a structured size report.
   * Heavy — avoid calling in hot paths.
   */
  getDatabaseSizes(): Promise<Record<string, unknown>> {
    return this.repo.getDatabaseSizes();
  }

  /**
   * Returns a lightweight tier-distribution snapshot suitable for monitoring endpoints.
   */
  getStats(): Promise<Record<string, unknown>> {
    return this.repo.getStats();
  }

  /**
   * Looks up cold-tier archive metadata for the given calendar year via the registry.
   *
   * @param year - Calendar year to query (e.g. 2022)
   */
  getArchiveForYear(year: number): Promise<Record<string, unknown>> {
    return this.repo.getArchiveForYear(year);
  }

  /**
   * Simulates a hot→warm partition rotation, moving up to `batchSize` eligible orders.
   *
   * @param batchSize - Maximum rows to rotate per call; defaults to 1000
   */
  simulateRotation(batchSize = 1000): Promise<Record<string, unknown>> {
    return this.repo.simulateRotation(batchSize);
  }
}
