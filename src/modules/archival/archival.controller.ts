import { Controller, Get, Post, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiSecurity } from '@nestjs/swagger';
import { ArchivalService } from './archival.service';
import { PartitionRotationService } from './partition-rotation.service';
import { Public } from '@common/decorators/public.decorator';
import { ApiEndpoint } from '@common/decorators/api-endpoint.decorator';

@ApiTags('archival')
@ApiSecurity('x-user-id')
@Controller({ path: 'admin/archival', version: '1' })
export class ArchivalController {
  constructor(
    private readonly archivalService: ArchivalService,
    private readonly rotationService: PartitionRotationService,
  ) {}

  /**
   * Trigger a simulated partition rotation, moving the oldest hot orders
   * (older than 90 days) into the warm metadata archive tier.
   */
  @Post('simulate-rotation')
  @Public()
  @ApiEndpoint({ summary: 'Simulate partition rotation: move oldest hot orders → warm tier' })
  simulateRotation() {
    return this.rotationService.simulateRotation();
  }

  /**
   * Return row counts per storage tier from orders_recent and user_order_index.
   */
  @Get('stats')
  @Public()
  @ApiEndpoint({ summary: 'Get row counts per storage tier' })
  getStats() {
    return this.archivalService.getStats();
  }

  /**
   * Return pg_database_size() for all DB instances (primary, metadata, cold archives).
   */
  @Get('database-sizes')
  @Public()
  @ApiEndpoint({ summary: 'Get pg_database_size() for all DB instances' })
  getDatabaseSizes() {
    return this.archivalService.getDatabaseSizes();
  }

  /**
   * Look up the cold archive config registered for a given year.
   *
   * @param year - The archive year (e.g. 2023)
   */
  @Get('archive-for-year/:year')
  @Public()
  @ApiEndpoint({ summary: 'Look up cold archive config for a given year' })
  getArchiveForYear(@Param('year', ParseIntPipe) year: number) {
    return this.archivalService.getArchiveForYear(year);
  }
}
