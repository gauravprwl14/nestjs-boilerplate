import { Injectable } from '@nestjs/common';
import { MockDataDbRepository } from './mock-data.db-repository';

@Injectable()
export class MockDataDbService {
  constructor(private readonly repo: MockDataDbRepository) {}

  /** @see MockDataDbRepository.getStatus */
  getStatus(): Promise<Record<string, unknown>> {
    return this.repo.getStatus();
  }

  /** @see MockDataDbRepository.getHotOrderCount */
  getHotOrderCount(): Promise<number> {
    return this.repo.getHotOrderCount();
  }
}
