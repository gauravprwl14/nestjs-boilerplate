import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
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
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  async getHealth(): Promise<HealthCheckResult> {
    return this.healthService.getHealth();
  }

  @Public()
  @Get('live')
  isAlive(): { status: 'ok' } {
    return this.healthService.isAlive();
  }

  @Public()
  @Get('ready')
  async isReady(): Promise<{ status: 'ready' }> {
    return this.healthService.isReady();
  }
}
