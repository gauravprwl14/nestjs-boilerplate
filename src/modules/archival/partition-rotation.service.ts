import { Injectable } from '@nestjs/common';
import { ArchivalDbService } from '@database/archival/archival.db-service';
import { AppLogger } from '@logger/logger.service';

@Injectable()
export class PartitionRotationService {
  constructor(
    private readonly archivalDb: ArchivalDbService,
    private readonly logger: AppLogger,
  ) {}

  async simulateRotation(batchSize = 1000): Promise<Record<string, unknown>> {
    const result = await this.archivalDb.simulateRotation(batchSize);
    if ((result as { recordsMoved: number }).recordsMoved > 0) {
      this.logger.logEvent('partition.rotated', {
        attributes: { recordsMoved: (result as { recordsMoved: number }).recordsMoved },
      });
    }
    return result;
  }
}
