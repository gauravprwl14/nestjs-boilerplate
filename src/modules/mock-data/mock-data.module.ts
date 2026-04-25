import { Module } from '@nestjs/common';
import { MockDataController } from './mock-data.controller';
import { MockDataService } from './mock-data.service';

/**
 * NestJS feature module for mock data status checks and generation triggers.
 *
 * `MockDataDbService` (and the underlying repository) are provided globally
 * by `DatabaseModule` — they do not need to be declared here.
 * `MockDataService` is internal to this module and not exported.
 */
@Module({
  controllers: [MockDataController],
  providers: [MockDataService],
})
export class MockDataModule {}
