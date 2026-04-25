import { Injectable } from '@nestjs/common';
import { MockDataDbRepository } from './mock-data.db-repository';

@Injectable()
export class MockDataDbService {
  constructor(private readonly repo: MockDataDbRepository) {}

  getStatus(): Promise<Record<string, unknown>> {
    return this.repo.getStatus();
  }

  getHotOrderCount(): Promise<number> {
    return this.repo.getHotOrderCount();
  }
}
