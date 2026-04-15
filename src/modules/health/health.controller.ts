import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { ApiEndpoint } from '@common/decorators/api-endpoint.decorator';
import { HealthService, HealthCheckResult } from './health.service';

/**
 * Health check controller.
 *
 * All routes are public (no authentication required).
 *
 * GET /health        — comprehensive health report
 * GET /health/live   — liveness probe
 * GET /health/ready  — readiness probe
 */
@ApiTags('Health')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  @ApiEndpoint({
    summary: 'Comprehensive health report with component breakdown',
    successStatus: HttpStatus.OK,
    successDescription: 'Health report returned',
    errorResponses: [HttpStatus.SERVICE_UNAVAILABLE],
  })
  async getHealth(): Promise<HealthCheckResult> {
    return this.healthService.getHealth();
  }

  @Public()
  @Get('live')
  @ApiEndpoint({
    summary: 'Liveness probe — confirms the process is alive',
    successStatus: HttpStatus.OK,
    successDescription: 'Process is alive',
  })
  isAlive(): { status: 'ok' } {
    return this.healthService.isAlive();
  }

  @Public()
  @Get('ready')
  @ApiEndpoint({
    summary: 'Readiness probe — confirms the app is ready to serve traffic',
    successStatus: HttpStatus.OK,
    successDescription: 'Service is ready',
    errorResponses: [HttpStatus.SERVICE_UNAVAILABLE],
  })
  async isReady(): Promise<{ status: 'ready' }> {
    return this.healthService.isReady();
  }
}
