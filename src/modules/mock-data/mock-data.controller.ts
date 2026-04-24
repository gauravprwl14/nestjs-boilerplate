import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MockDataService } from './mock-data.service';
import { Public } from '@common/decorators/public.decorator';
import { ApiEndpoint } from '@common/decorators/api-endpoint.decorator';

@ApiTags('mock-data')
@Controller({ path: 'mock-data', version: '1' })
export class MockDataController {
  constructor(private readonly mockDataService: MockDataService) {}

  /**
   * Return data status (row counts, date ranges) across all storage tiers.
   */
  @Get('status')
  @Public()
  @ApiEndpoint({ summary: 'Get data status across all storage tiers' })
  getStatus() {
    return this.mockDataService.getStatus();
  }

  /**
   * Trigger data generation if tables are empty; returns instructions if
   * seeding is needed via container restart.
   */
  @Post('generate')
  @Public()
  @ApiEndpoint({ summary: 'Trigger data generation if tables are empty' })
  generate() {
    return this.mockDataService.generateIfEmpty();
  }
}
