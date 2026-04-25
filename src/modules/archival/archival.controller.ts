import { Controller, Get, Post, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiSecurity } from '@nestjs/swagger';
import { ArchivalService } from './archival.service';
import { PartitionRotationService } from './partition-rotation.service';
import { Public } from '@common/decorators/public.decorator';
import { ApiEndpoint } from '@common/decorators/api-endpoint.decorator';

/**
 * REST controller for archival admin endpoints.
 *
 * Base path: `GET|POST /api/v1/admin/archival`.
 * All routes are decorated with `@Public()` — these are internal admin
 * operations not subject to the `AuthContextGuard` tenant check.
 */
@ApiTags('archival')
@ApiSecurity('x-user-id')
@Controller({ path: 'admin/archival', version: '1' })
export class ArchivalController {
  constructor(
    private readonly archivalService: ArchivalService,
    private readonly rotationService: PartitionRotationService,
  ) {}

  /**
   * Triggers a simulated partition rotation, moving the oldest hot-tier orders
   * (those older than 90 days) into the warm metadata archive tier.
   *
   * This is a write operation — results in DB mutations on `orders_recent` and
   * `user_order_index`. Safe to call repeatedly; a no-op run returns `recordsMoved: 0`.
   *
   * @returns Result of the rotation, including the count of records moved.
   */
  @Post('simulate-rotation')
  @Public()
  @ApiEndpoint({ summary: 'Simulate partition rotation: move oldest hot orders → warm tier' })
  simulateRotation() {
    return this.rotationService.simulateRotation();
  }

  /**
   * Returns row counts per storage tier from `orders_recent` and `user_order_index`.
   *
   * Useful for verifying data distribution and confirming rotation outcomes.
   *
   * @returns Tier statistics map as returned by the DB layer.
   */
  @Get('stats')
  @Public()
  @ApiEndpoint({ summary: 'Get row counts per storage tier' })
  getStats() {
    return this.archivalService.getStats();
  }

  /**
   * Returns `pg_database_size()` for all registered DB instances:
   * primary (hot), metadata archive (warm), and each cold year-archive.
   *
   * @returns Map of instance label → size information.
   */
  @Get('database-sizes')
  @Public()
  @ApiEndpoint({ summary: 'Get pg_database_size() for all DB instances' })
  getDatabaseSizes() {
    return this.archivalService.getDatabaseSizes();
  }

  /**
   * Looks up the cold archive configuration registered for a given calendar year.
   *
   * Each year's archive is a separate Postgres instance. This endpoint returns
   * the connection metadata and row counts for that archive.
   *
   * @param year - Four-digit calendar year (e.g. 2023).
   * @returns Archive configuration record, or an empty result when no archive exists.
   */
  @Get('archive-for-year/:year')
  @Public()
  @ApiEndpoint({ summary: 'Look up cold archive config for a given year' })
  getArchiveForYear(@Param('year', ParseIntPipe) year: number) {
    return this.archivalService.getArchiveForYear(year);
  }
}
