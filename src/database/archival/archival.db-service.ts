import { Injectable } from '@nestjs/common';
import { ArchivalDbRepository } from './archival.db-repository';

@Injectable()
export class ArchivalDbService {
  constructor(private readonly repo: ArchivalDbRepository) {}

  getDatabaseSizes(): Promise<Record<string, unknown>> {
    return this.repo.getDatabaseSizes();
  }

  getStats(): Promise<Record<string, unknown>> {
    return this.repo.getStats();
  }

  getArchiveForYear(year: number): Promise<Record<string, unknown>> {
    return this.repo.getArchiveForYear(year);
  }

  simulateRotation(batchSize = 1000): Promise<Record<string, unknown>> {
    return this.repo.simulateRotation(batchSize);
  }
}
