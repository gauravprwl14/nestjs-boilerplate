import { Injectable } from '@nestjs/common';
import { ArchivalDbRepository } from './archival.db-repository';

@Injectable()
export class ArchivalDbService {
  constructor(private readonly repo: ArchivalDbRepository) {}

  /** @see ArchivalDbRepository.getDatabaseSizes */
  getDatabaseSizes(): Promise<Record<string, unknown>> {
    return this.repo.getDatabaseSizes();
  }

  /** @see ArchivalDbRepository.getStats */
  getStats(): Promise<Record<string, unknown>> {
    return this.repo.getStats();
  }

  /**
   * @see ArchivalDbRepository.getArchiveForYear
   * @param year - Archive year to look up
   */
  getArchiveForYear(year: number): Promise<Record<string, unknown>> {
    return this.repo.getArchiveForYear(year);
  }

  /**
   * @see ArchivalDbRepository.simulateRotation
   * @param batchSize - Orders to rotate per call (default 1000)
   */
  simulateRotation(batchSize = 1000): Promise<Record<string, unknown>> {
    return this.repo.simulateRotation(batchSize);
  }
}
