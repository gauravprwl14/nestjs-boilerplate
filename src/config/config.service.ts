import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvConfig } from '@config/schemas/env.schema';

/**
 * Application-wide typed configuration service.
 * Wraps NestJS ConfigService with domain-specific typed getters.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  // ─── App config ──────────────────────────────────────────────────────────────

  /**
   * Application-level config (server, API metadata, logging).
   */
  get app() {
    return {
      nodeEnv: this.configService.get('NODE_ENV', { infer: true }),
      name: this.configService.get('APP_NAME', { infer: true }),
      port: this.configService.get('APP_PORT', { infer: true }),
      host: this.configService.get('APP_HOST', { infer: true }),
      apiPrefix: this.configService.get('API_PREFIX', { infer: true }),
      apiVersion: this.configService.get('API_VERSION', { infer: true }),
      logLevel: this.configService.get('LOG_LEVEL', { infer: true }),
    };
  }

  // ─── Database config ──────────────────────────────────────────────────────────

  /**
   * Database connection config.
   */
  get database() {
    return {
      url: this.configService.get('DATABASE_URL', { infer: true }),
    };
  }

  // ─── OTel config ──────────────────────────────────────────────────────────────

  /**
   * OpenTelemetry tracing/exporter config.
   */
  get otel() {
    return {
      enabled: this.configService.get('OTEL_ENABLED', { infer: true }),
      serviceName: this.configService.get('OTEL_SERVICE_NAME', { infer: true }),
      exporterEndpoint: this.configService.get('OTEL_EXPORTER_OTLP_ENDPOINT', { infer: true }),
      exporterProtocol: this.configService.get('OTEL_EXPORTER_OTLP_PROTOCOL', { infer: true }),
    };
  }

  // ─── CORS config ──────────────────────────────────────────────────────────────

  /**
   * CORS allowed origins.
   * Splits the comma-separated string into an array of trimmed origin strings.
   */
  get cors() {
    const raw = this.configService.get('CORS_ORIGINS', { infer: true });
    const origins = raw
      .split(',')
      .map(o => o.trim())
      .filter(Boolean);
    return { origins };
  }

  // ─── Shutdown config ──────────────────────────────────────────────────────────

  /**
   * Graceful shutdown config.
   */
  get shutdown() {
    return {
      timeoutMs: this.configService.get('SHUTDOWN_TIMEOUT_MS', { infer: true }),
    };
  }

  // ─── Convenience getters ──────────────────────────────────────────────────────

  /** Returns true when running in development mode. */
  get isDevelopment(): boolean {
    return this.app.nodeEnv === 'development';
  }

  /** Returns true when running in production mode. */
  get isProduction(): boolean {
    return this.app.nodeEnv === 'production';
  }

  /** Returns true when running in test mode. */
  get isTest(): boolean {
    return this.app.nodeEnv === 'test';
  }
}
