import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MockDataService } from './mock-data.service';
import { Public } from '@common/decorators/public.decorator';
import { ApiEndpoint } from '@common/decorators/api-endpoint.decorator';

/**
 * REST controller for mock data status and generation triggers.
 *
 * Base path: `GET|POST /api/v1/mock-data`.
 * All routes are `@Public()` — these are development/ops helpers that bypass
 * the `AuthContextGuard` tenant check.
 */
@ApiTags('mock-data')
@Controller({ path: 'mock-data', version: '1' })
export class MockDataController {
  constructor(private readonly mockDataService: MockDataService) {}

  /**
   * Returns row counts, date ranges, and health metadata for all storage tiers
   * (hot, warm, and each registered cold year-archive).
   *
   * @returns Status map as returned by {@link MockDataService.getStatus}.
   */
  @Get('status')
  @Public()
  @ApiEndpoint({ summary: 'Get data status across all storage tiers' })
  getStatus() {
    return this.mockDataService.getStatus();
  }

  /**
   * Checks whether data already exists; if not, returns instructions for
   * re-seeding via container restart.
   *
   * This is a non-destructive operation — it will never overwrite existing data.
   * Actual seeding is performed by the `init-scripts/` SQL executed at container
   * startup, not at runtime.
   *
   * @returns A message object with either a skip notice or step-by-step seeding instructions.
   */
  @Post('generate')
  @Public()
  @ApiEndpoint({ summary: 'Trigger data generation if tables are empty' })
  generate() {
    return this.mockDataService.generateIfEmpty();
  }
}
