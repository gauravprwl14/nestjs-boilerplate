import { SpanKind, SpanStatusCode } from '@opentelemetry/api';

/**
 * Options for creating a new trace span.
 */
export interface TraceOptions {
  /**
   * The name of the span. Defaults to the decorated method name.
   */
  spanName?: string;

  /**
   * The span kind (e.g. SERVER, CLIENT, INTERNAL).
   * @default SpanKind.INTERNAL
   */
  kind?: SpanKind;

  /**
   * Static key-value attributes to attach to the span at creation time.
   */
  attributes?: Record<string, string | number | boolean>;

  /**
   * When true, the span is recorded but not exported (useful for tests).
   * @default false
   */
  root?: boolean;
}

/**
 * Options for incrementing a named counter metric.
 */
export interface CounterOptions {
  /**
   * The metric name. Defaults to METRIC_COUNTER_DEFAULT.
   */
  name?: string;

  /**
   * Human-readable description for the metric instrument.
   */
  description?: string;

  /**
   * Unit of measurement (e.g. `{request}`, `ms`, `bytes`).
   */
  unit?: string;

  /**
   * The amount to increment by.
   * @default 1
   */
  delta?: number;

  /**
   * Static labels/attributes to attach to the observation.
   */
  attributes?: Record<string, string | number | boolean>;
}

/**
 * Options for recording a duration/histogram metric.
 */
export interface DurationOptions {
  /**
   * The metric name. Defaults to METRIC_DURATION_DEFAULT.
   */
  name?: string;

  /**
   * Human-readable description for the histogram instrument.
   */
  description?: string;

  /**
   * Unit of measurement.
   * @default 'ms'
   */
  unit?: string;

  /**
   * Static labels/attributes to attach to each observation.
   */
  attributes?: Record<string, string | number | boolean>;
}

/**
 * Options for the @InstrumentClass() class-level decorator.
 */
export interface InstrumentClassOptions {
  /**
   * Method names to exclude from auto-instrumentation.
   * @example ['constructor', 'onModuleInit']
   */
  exclude?: string[];

  /**
   * Prefix added to every auto-generated span name.
   * Defaults to the class name.
   */
  prefix?: string;
}

/**
 * Span status codes re-exported for convenience.
 */
export { SpanKind, SpanStatusCode };
