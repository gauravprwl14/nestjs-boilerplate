import { Injectable } from '@nestjs/common';
import { MockDataDbService } from '@database/mock-data/mock-data.db-service';
import { AppLogger } from '@logger/logger.service';

@Injectable()
export class MockDataService {
  constructor(
    private readonly mockDataDb: MockDataDbService,
    private readonly logger: AppLogger,
  ) {}

  getStatus(): Promise<Record<string, unknown>> {
    return this.mockDataDb.getStatus();
  }

  async generateIfEmpty(): Promise<Record<string, unknown>> {
    const count = await this.mockDataDb.getHotOrderCount();
    if (count > 0) {
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
