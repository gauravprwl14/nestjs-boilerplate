/**
 * Test harness that installs an {@link InMemorySpanExporter} into a real
 * {@link NodeSDK} with the same instrumentations as production
 * (`src/telemetry/otel-sdk.ts`). Using a full NodeSDK — rather than a raw
 * {@link BasicTracerProvider} — keeps `@Trace` / `@InstrumentClass` /
 * {@link PrismaInstrumentation} behaving exactly as they do in production,
 * so e2e assertions reflect what operators actually see in Tempo.
 *
 * Call {@link installInMemoryOtel} **before** `Test.createTestingModule(...)`.
 * Instrumentation patches are applied at `sdk.start()` time; Nest modules
 * loaded after that point get instrumented, which is what we want.
 *
 * @example
 * ```ts
 * const { exporter, shutdown } = installInMemoryOtel();
 * const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
 * // …
 * afterAll(async () => { await app.close(); await shutdown(); });
 * ```
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  AlwaysOnSampler,
} from '@opentelemetry/sdk-trace-base';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PrismaInstrumentation } from '@prisma/instrumentation';

/** Result returned by {@link installInMemoryOtel}. */
export interface InMemoryOtelHandle {
  /** Accumulates every finished span. Call `.reset()` between tests. */
  readonly exporter: InMemorySpanExporter;
  /** Shuts the SDK down; safe to call multiple times. */
  readonly shutdown: () => Promise<void>;
}

/**
 * Boots a test-only {@link NodeSDK} backed by an {@link InMemorySpanExporter}.
 * The SDK wires the same auto-instrumentations as production and starts a
 * {@link SimpleSpanProcessor} so spans land in the exporter synchronously
 * after each span ends — no flush needed between assertions.
 *
 * The metric/log pipelines are omitted deliberately: the e2e harness only
 * asserts on traces, and real OTLP exporters would require a collector.
 */
export function installInMemoryOtel(): InMemoryOtelHandle {
  const exporter = new InMemorySpanExporter();

  const resource = resourceFromAttributes({
    'service.name': 'enterprise-twitter-e2e',
    'deployment.environment': 'test',
  });

  const sdk = new NodeSDK({
    resource,
    sampler: new AlwaysOnSampler(),
    spanProcessors: [new SimpleSpanProcessor(exporter)],
    textMapPropagator: new W3CTraceContextPropagator(),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Match production ignore-list so non-API endpoints don't pollute
        // the exporter. The e2e suite only hits /api/* so this is a
        // belt-and-braces filter.
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: req => {
            const url = req.url ?? '';
            return /\/(health|metrics|favicon\.ico)/i.test(url);
          },
        },
        '@opentelemetry/instrumentation-fs': { enabled: false },
        // Express instrumentation is disabled in production for the same
        // reason (wraps error handlers → NotFoundException bypasses filters).
        '@opentelemetry/instrumentation-express': { enabled: false },
        // Pino instrumentation is a no-op in tests (no OTLP log exporter),
        // but enable it for parity with production span/log correlation.
        '@opentelemetry/instrumentation-pino': { enabled: true },
      }),
      new PrismaInstrumentation(),
    ],
  });

  sdk.start();

  let shuttingDown: Promise<void> | undefined;
  const shutdown = (): Promise<void> => {
    if (shuttingDown) return shuttingDown;
    shuttingDown = sdk.shutdown().catch(() => undefined);
    return shuttingDown;
  };

  return { exporter, shutdown };
}
