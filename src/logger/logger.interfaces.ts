/**
 * Primitive value types allowed as log attribute values.
 */
export type LogAttributeValue = string | number | boolean | string[] | number[];

/**
 * A flat key-value map of structured log attributes.
 */
export type LogAttributes = Record<string, LogAttributeValue>;

/**
 * Log severity levels matching Pino and OpenTelemetry conventions.
 */
export enum LogLevel {
  /** Most verbose, for fine-grained tracing. */
  TRACE = 'trace',
  /** Debugging information. */
  DEBUG = 'debug',
  /** General informational messages. */
  INFO = 'info',
  /** Warning conditions. */
  WARN = 'warn',
  /** Error conditions. */
  ERROR = 'error',
  /** Critical/fatal errors — application may not recover. */
  FATAL = 'fatal',
}

/**
 * Base options shared across all log operations.
 */
export interface ILogOptions {
  /**
   * Override the default log level for this log call.
   */
  level?: LogLevel;

  /**
   * Whether this log call is active.
   * @default true
   */
  enabled?: boolean;

  /**
   * Structured key-value attributes to attach to the log entry.
   */
  attributes?: LogAttributes;

  /**
   * When true, only writes to the active OpenTelemetry span — skips Pino output.
   * @default false
   */
  spanOnly?: boolean;

  /**
   * When true, only writes to Pino — skips OTel span enrichment.
   * @default false
   */
  logOnly?: boolean;
}

/**
 * Options for structured event logging.
 * Extends base log options with no additional fields.
 */
export interface ILogEventOptions extends ILogOptions {}

/**
 * Options specific to error logging.
 */
export interface ILogErrorOptions extends ILogOptions {
  /**
   * Whether to call `span.recordException(error)` on the active OTel span.
   * @default true
   */
  recordException?: boolean;
}

/**
 * Core application logger interface.
 * Implementations must support structured logging, OTel span enrichment,
 * and child logger creation.
 */
export interface IAppLogger {
  /**
   * Log a plain message, optionally with structured attributes.
   * @param message  Human-readable log message.
   * @param options  Logging options (level, attributes, span routing, etc.)
   */
  log(message: string, options?: ILogOptions): void;

  /**
   * Log a named structured event with optional attributes.
   * Adds an OTel span event via `trace.getActiveSpan()` unless logOnly is set.
   * @param eventName  Machine-readable event name (e.g. `user.created`).
   * @param options    Logging options.
   */
  logEvent(eventName: string, options?: ILogEventOptions): void;

  /**
   * Log an error with optional exception recording on the active OTel span.
   * @param eventName  Descriptive event/context name for the error.
   * @param error      The caught Error object.
   * @param options    Error-specific logging options.
   */
  logError(eventName: string, error: Error, options?: ILogErrorOptions): void;

  /**
   * Add key-value attributes directly to the currently active OTel span.
   * Does nothing when no span is active.
   * @param attributes  Attributes to merge into the span.
   */
  addSpanAttributes(attributes: LogAttributes): void;

  /**
   * Create a child logger that inherits this logger's context and attributes,
   * merged with the provided additional context.
   * Does NOT mutate any shared/global state.
   * @param context  Additional context name or attributes for the child.
   */
  child(context: string | LogAttributes): IAppLogger;
}
