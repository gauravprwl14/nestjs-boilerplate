/**
 * Side-effect import that starts the OpenTelemetry SDK at module-load time,
 * BEFORE any other application imports. This is required because
 * auto-instrumentation patches (@nestjs/core, pino, http, etc.) only take
 * effect on modules loaded AFTER `sdk.start()`. If initOtelSdk is called
 * from inside `bootstrap()`, nestjs-core + pino are already cached and
 * cannot be patched — pino→Loki shipping would silently no-op.
 *
 * Usage (main.ts, must be the very first import):
 *   import '@telemetry/otel-preload';
 */
import { initOtelSdk } from './otel-sdk';

initOtelSdk({
  enabled: process.env.OTEL_ENABLED === 'true',
  serviceName: process.env.OTEL_SERVICE_NAME ?? 'enterprise-twitter',
  exporterEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  exporterProtocol: process.env.OTEL_EXPORTER_OTLP_PROTOCOL ?? 'grpc',
  environment: process.env.NODE_ENV ?? 'development',
});
