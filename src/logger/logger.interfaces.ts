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
 * Options for log() — the only method where level makes sense to override.
 *
 * @example
 * ```typescript
 * logger.log('Custom message', { level: LogLevel.WARN, attributes: { userId } });
 * logger.log('Fatal alert', { level: LogLevel.FATAL, attributes: { reason: 'oom' } });
 * ```
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
 * Options for logEvent() — always INFO level.
 * Use log() with a level override if you need a different severity.
 *
 * @example
 * ```typescript
 * logger.logEvent('user.created', { attributes: { userId } });
 * logger.logEvent('cache.miss', { attributes: { key }, logOnly: true });
 * ```
 */
export interface ILogEventOptions {
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
 * Options for logError() — always ERROR level.
 *
 * @example
 * ```typescript
 * logger.logError('payment.failed', error, { attributes: { orderId } });
 * logger.logError('db.query.failed', error, { recordException: false });
 * ```
 */
export interface ILogErrorOptions {
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
   * Log a plain message with optional level override and structured attributes.
   * Use this as the escape hatch when you need a level other than INFO or ERROR.
   *
   * @param message  Human-readable log message.
   * @param options  Logging options (level, attributes, span routing, etc.)
   *
   * @example
   * ```typescript
   * logger.log('Process exiting', { level: LogLevel.FATAL, attributes: { pid: process.pid } });
   * logger.log('Queue depth high', { level: LogLevel.WARN, attributes: { depth: 500 } });
   * ```
   */
  log(message: string, options?: ILogOptions): void;

  /**
   * Log a named structured event at INFO level.
   * Adds an OTel span event via `trace.getActiveSpan()` unless logOnly is set.
   * Use log() with a level override if you need a non-INFO severity.
   *
   * @param eventName  Machine-readable event name (e.g. `user.created`).
   * @param options    Event logging options (no level — always INFO).
   *
   * @example
   * ```typescript
   * logger.logEvent('user.created', { attributes: { userId, email } });
   * logger.logEvent('cache.invalidated', { attributes: { key }, logOnly: true });
   * ```
   */
  logEvent(eventName: string, options?: ILogEventOptions): void;

  /**
   * Log an error at ERROR level with optional exception recording on the active OTel span.
   * For FATAL-level errors, use log() with level: LogLevel.FATAL instead.
   *
   * @param eventName  Descriptive event/context name for the error.
   * @param error      The caught Error object.
   * @param options    Error-specific logging options (no level — always ERROR).
   *
   * @example
   * ```typescript
   * logger.logError('payment.failed', error, { attributes: { orderId } });
   * logger.logError('db.query.failed', error, { recordException: false });
   * ```
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
