import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma.service';
import { ErrorException } from '@errors/types/error-exception';
import { GEN } from '@errors/error-codes';

/** Status of a single health component */
export type ComponentStatus = 'healthy' | 'degraded' | 'unhealthy';

/** Health information for a single component */
export interface ComponentHealth {
  status: ComponentStatus;
  /** Optional human-readable description */
  message?: string;
  /** Optional latency in milliseconds */
  latencyMs?: number;
}

/** Overall health check result */
export interface HealthCheckResult {
  /** Overall aggregated status */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Map of component name to health detail */
  components: Record<string, ComponentHealth>;
  /** Process uptime in seconds */
  uptime: number;
  /** ISO timestamp of when the check was performed */
  timestamp: string;
}

/**
 * Service responsible for application health checks.
 *
 * - isAlive() — lightweight liveness probe (always returns ok if process is running)
 * - isReady() — readiness probe (checks critical dependencies like the DB)
 * - getHealth() — comprehensive health report with component breakdown
 */
@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liveness probe — confirms the process is alive.
   */
  isAlive(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /**
   * Readiness probe — confirms the application is ready to serve traffic.
   * Throws ErrorException GEN.SERVICE_UNAVAILABLE (GEN0003) if any critical dependency is down.
   */
  async isReady(): Promise<{ status: 'ready' }> {
    const dbHealthy = await this.prisma.isHealthy();

    if (!dbHealthy) {
      throw new ErrorException(GEN.SERVICE_UNAVAILABLE, {
        message: 'Service not ready: database is unavailable',
      });
    }

    return { status: 'ready' };
  }

  /**
   * Comprehensive health check with component-level detail.
   */
  async getHealth(): Promise<HealthCheckResult> {
    const timestamp = new Date().toISOString();
    const uptime = process.uptime();
    const components: Record<string, ComponentHealth> = {};

    // ─── Database ────────────────────────────────────────────────────────────

    const dbStart = Date.now();
    const dbHealthy = await this.prisma.isHealthy();
    const dbLatency = Date.now() - dbStart;

    components['database'] = {
      status: dbHealthy ? 'healthy' : 'unhealthy',
      message: dbHealthy ? 'Connected' : 'Unreachable',
      latencyMs: dbLatency,
    };

    // ─── Overall status ──────────────────────────────────────────────────────

    const statuses = Object.values(components).map((c) => c.status);
    let status: HealthCheckResult['status'];

    if (statuses.every((s) => s === 'healthy')) {
      status = 'healthy';
    } else if (statuses.some((s) => s === 'unhealthy')) {
      status = 'unhealthy';
    } else {
      status = 'degraded';
    }

    return { status, components, uptime, timestamp };
  }
}
