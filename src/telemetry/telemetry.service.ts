import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { trace, metrics, SpanStatusCode, SpanKind, SpanOptions } from '@opentelemetry/api';
import { TraceOptions, CounterOptions, DurationOptions } from './interfaces/telemetry.interfaces';
import {
  TRACER_NAME,
  METER_NAME,
  METRIC_COUNTER_DEFAULT,
  METRIC_DURATION_DEFAULT,
} from './otel.constants';

/**
 * Application-level telemetry service.
 *
 * Provides thin wrappers around the OpenTelemetry API for tracing and metrics.
 * All methods are safe to call when OTel is disabled — the no-op provider
 * installed by default means no spans/metrics are emitted.
 */
@Injectable()
export class TelemetryService implements OnModuleDestroy {
  private readonly tracer = trace.getTracer(TRACER_NAME);
  private readonly meter = metrics.getMeter(METER_NAME);

  // ─── Tracing ──────────────────────────────────────────────────────────────

  /**
   * Runs `fn` inside a new active span.
   *
   * The span is automatically ended (with an ERROR status on exception) when
   * `fn` resolves/rejects. The active context is propagated correctly for both
   * sync and async functions.
   *
   * @param spanName  The name of the span.
   * @param fn        The work to execute inside the span.
   * @param options   Optional span configuration.
   */
  async startSpan<T>(
    spanName: string,
    fn: () => T | Promise<T>,
    options?: TraceOptions,
  ): Promise<T> {
    const spanOptions: SpanOptions = {
      kind: options?.kind ?? SpanKind.INTERNAL,
      attributes: options?.attributes,
    };

    return this.tracer.startActiveSpan(spanName, spanOptions, async span => {
      try {
        const result = await Promise.resolve(fn());
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (err) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: err instanceof Error ? err.message : String(err),
        });
        if (err instanceof Error) {
          span.recordException(err);
        }
        throw err;
      } finally {
        span.end();
      }
    });
  }

  // ─── Metrics ──────────────────────────────────────────────────────────────

  /**
   * Increments a named counter by `options.delta` (default 1).
   *
   * @param options  Counter configuration including name and attributes.
   */
  incrementCounter(options?: CounterOptions): void {
    const name = options?.name ?? METRIC_COUNTER_DEFAULT;
    const counter = this.meter.createCounter(name, {
      description: options?.description,
      unit: options?.unit,
    });
    counter.add(options?.delta ?? 1, options?.attributes);
  }

  /**
   * Records a duration (histogram) observation in milliseconds.
   *
   * @param durationMs  The value to record.
   * @param options     Histogram configuration including name and attributes.
   */
  recordHistogram(durationMs: number, options?: DurationOptions): void {
    const name = options?.name ?? METRIC_DURATION_DEFAULT;
    const histogram = this.meter.createHistogram(name, {
      description: options?.description,
      unit: options?.unit ?? 'ms',
    });
    histogram.record(durationMs, options?.attributes);
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  async onModuleDestroy(): Promise<void> {
    // SDK shutdown is handled by shutdownOtelSdk() in process-handlers.
    // Nothing to clean up here.
  }
}
