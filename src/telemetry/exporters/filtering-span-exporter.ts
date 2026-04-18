import type { ExportResult } from '@opentelemetry/core';
import { ExportResultCode } from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';

/**
 * Predicate returning `true` when the span should be DROPPED by the exporter.
 * Predicates must not throw — the wrapper catches and treats a throw as
 * "do not drop" (fail-open) so a buggy rule can never disappear telemetry.
 */
export type SpanDropPredicate = (span: ReadableSpan) => boolean;

/**
 * Default drop rules.
 *
 * - `middleware - <anonymous>` comes from
 *   `@opentelemetry/instrumentation-router` when it tries to instrument an
 *   anonymous NestJS/Express middleware function. The span is pure visual
 *   noise in Tempo and carries no useful attributes.
 */
export const DEFAULT_DROP_PREDICATES: readonly SpanDropPredicate[] = [
  (span: ReadableSpan): boolean => span.name === 'middleware - <anonymous>',
];

/**
 * A {@link SpanExporter} decorator that filters spans out before they are
 * handed to the inner (real) exporter.
 *
 * This runs in the export pipeline rather than in a `SpanProcessor.onEnd`
 * hook because the SDK's `SpanProcessor` contract does not permit
 * suppression — by the time `onEnd` fires the span is already queued for
 * export. Decorating the exporter is the only clean extension point.
 *
 * ## Guarantees
 *
 * - The filter is fail-open: a throwing predicate leaves the span in the
 *   kept list. Better to over-export than to lose telemetry silently.
 * - `shutdown()` and `forceFlush()` delegate directly to the inner exporter
 *   and propagate its resolution / rejection.
 * - When every span is dropped the wrapper still calls `inner.export([], cb)`
 *   so result-callback contracts are preserved.
 *
 * @example
 * ```ts
 * const inner = new OTLPTraceExporter({ url });
 * const exporter = new FilteringSpanExporter(inner); // uses DEFAULT_DROP_PREDICATES
 * ```
 */
export class FilteringSpanExporter implements SpanExporter {
  constructor(
    private readonly inner: SpanExporter,
    private readonly predicates: readonly SpanDropPredicate[] = DEFAULT_DROP_PREDICATES,
  ) {}

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    let kept: ReadableSpan[];
    try {
      kept = spans.filter(span => !this.shouldDrop(span));
    } catch {
      // Absolute backstop — if .filter itself throws (unexpected), ship
      // everything. Reporting success here would swallow the inner exporter
      // contract; reporting failure would lose all spans. Shipping unfiltered
      // preserves telemetry and lets the inner exporter decide.
      kept = spans;
    }

    try {
      this.inner.export(kept, resultCallback);
    } catch (error) {
      // inner.export should never throw synchronously, but we guard to honour
      // the "never throw from the export pipeline" rule.
      resultCallback({
        code: ExportResultCode.FAILED,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  async shutdown(): Promise<void> {
    return this.inner.shutdown();
  }

  async forceFlush(): Promise<void> {
    // Optional in the SpanExporter interface; some exporters don't implement
    // it (BatchSpanProcessor calls the processor's flush, not the exporter's).
    if (typeof this.inner.forceFlush === 'function') {
      return this.inner.forceFlush();
    }
    return undefined;
  }

  /**
   * True iff any predicate matches this span. Per-predicate errors are
   * swallowed: treat a throwing predicate as "not a match" so a buggy rule
   * cannot silently drop telemetry.
   */
  private shouldDrop(span: ReadableSpan): boolean {
    for (const predicate of this.predicates) {
      try {
        if (predicate(span)) return true;
      } catch {
        // swallow — fail-open
      }
    }
    return false;
  }
}
