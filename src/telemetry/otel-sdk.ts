/**
 * OpenTelemetry SDK bootstrap.
 *
 * Call `initOtelSdk()` at the very top of `main.ts` — before NestFactory.create —
 * so all instrumentation patches are applied before any modules are loaded.
 *
 * Call `shutdownOtelSdk()` inside your graceful-shutdown handler to flush any
 * pending telemetry before the process exits.
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { trace, Span } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-grpc';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PrismaInstrumentation } from '@prisma/instrumentation';
import { FilteringSpanExporter } from './exporters/filtering-span-exporter';
import {
  OTEL_DEFAULT_GRPC_ENDPOINT,
  OTEL_IGNORE_PATHS,
  OTEL_SHUTDOWN_TIMEOUT_MS,
  OTEL_EXPORT_TIMEOUT_MS,
  RESOURCE_SERVICE_NAME,
  RESOURCE_DEPLOYMENT_ENVIRONMENT,
  TRACER_NAME,
} from './otel.constants';

// ─── Config type ──────────────────────────────────────────────────────────────

export interface OtelConfig {
  enabled: boolean;
  serviceName: string;
  exporterEndpoint?: string;
  exporterProtocol?: string;
  environment?: string;
}

// ─── Module-level SDK instance ────────────────────────────────────────────────

let sdk: NodeSDK | null = null;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialises the OpenTelemetry Node SDK.
 *
 * When `config.enabled` is `false` this is a no-op — no exporters are created
 * and the global TracerProvider remains the default no-op provider.
 */
export function initOtelSdk(config: OtelConfig): void {
  if (!config.enabled) {
    return;
  }

  const endpoint = config.exporterEndpoint ?? OTEL_DEFAULT_GRPC_ENDPOINT;
  const environment = config.environment ?? process.env.NODE_ENV ?? 'development';

  // Wrap the real OTLP exporter with FilteringSpanExporter so noise spans
  // (e.g. `middleware - <anonymous>` from instrumentation-router) never reach
  // Tempo. The wrapper delegates shutdown() / forceFlush() straight through
  // and fails open — a buggy predicate can never disappear telemetry.
  const innerTraceExporter = new OTLPTraceExporter({ url: endpoint });
  const traceExporter = new FilteringSpanExporter(innerTraceExporter);

  const metricExporter = new OTLPMetricExporter({ url: endpoint });

  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: OTEL_EXPORT_TIMEOUT_MS,
  });

  // Logs pipeline: Pino auto-instrumentation emits LogRecords to the OTel Logs
  // API; BatchLogRecordProcessor batches and ships them via OTLP to the
  // collector, which forwards to Loki (see docker/grafana/otel-collector-config.yml).
  const logExporter = new OTLPLogExporter({ url: endpoint });
  const logRecordProcessor = new BatchLogRecordProcessor(logExporter);

  const resource = resourceFromAttributes({
    [RESOURCE_SERVICE_NAME]: config.serviceName,
    [RESOURCE_DEPLOYMENT_ENVIRONMENT]: environment,
  });

  sdk = new NodeSDK({
    resource,
    traceExporter,
    metricReader,
    logRecordProcessors: [logRecordProcessor],
    textMapPropagator: new W3CTraceContextPropagator(),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: req => {
            const url = req.url ?? '';
            return OTEL_IGNORE_PATHS.some(pattern => pattern.test(url));
          },
        },
        // Disable noisy fs instrumentation
        '@opentelemetry/instrumentation-fs': {
          enabled: false,
        },
        // Disable Express instrumentation — it wraps Express error handlers
        // and causes 404 NotFoundException to bypass NestJS exception filters.
        // HTTP instrumentation provides sufficient request/response tracing.
        '@opentelemetry/instrumentation-express': {
          enabled: false,
        },
        // Pino instrumentation: forwards every pino log to the OTel Logs API,
        // where BatchLogRecordProcessor + OTLPLogExporter ship it to the collector.
        '@opentelemetry/instrumentation-pino': {
          enabled: true,
        },
      }),
      // Prisma instrumentation: emits client-level spans (query, operation,
      // serialize, engine connection) so DB latency is visible in Tempo.
      // Prisma 7 emits engine spans natively; the v7 `@prisma/instrumentation`
      // config only accepts `ignoreSpanTypes` — the legacy `middleware` flag
      // is no longer needed (tracing preview has also been enabled in
      // schema.prisma for forward compatibility).
      new PrismaInstrumentation(),
    ],
  });

  sdk.start();
}

/**
 * Gracefully flushes pending spans/metrics and shuts down the SDK.
 * Safe to call even when OTel is disabled (no-op in that case).
 */
export async function shutdownOtelSdk(): Promise<void> {
  if (!sdk) {
    return;
  }

  const shutdownTimeout = new Promise<void>(resolve =>
    setTimeout(resolve, OTEL_SHUTDOWN_TIMEOUT_MS),
  );

  await Promise.race([sdk.shutdown(), shutdownTimeout]);
  sdk = null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the currently active span, or `undefined` when there is no active span.
 */
export function getCurrentSpan(): Span | undefined {
  const span = trace.getActiveSpan();
  return span ?? undefined;
}

/**
 * Returns a named tracer from the global TracerProvider.
 * Uses the application tracer name by default.
 */
export function getTracer(name: string = TRACER_NAME) {
  return trace.getTracer(name);
}
