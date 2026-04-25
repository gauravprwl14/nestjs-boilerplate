import { Injectable } from '@nestjs/common';
import { ArchivalDbService } from '@database/archival/archival.db-service';

@Injectable()
export class ArchivalService {
  constructor(private readonly archivalDb: ArchivalDbService) {}

  getDatabaseSizes(): Promise<Record<string, unknown>> {
    return this.archivalDb.getDatabaseSizes();
  }

  getStats(): Promise<Record<string, unknown>> {
    return this.archivalDb.getStats();
  }

  getArchiveForYear(year: number): Promise<Record<string, unknown>> {
    return this.archivalDb.getArchiveForYear(year);
  }
}
