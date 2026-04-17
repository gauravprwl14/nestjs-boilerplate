import { Injectable, LoggerService } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import {
  IAppLogger,
  ILogOptions,
  ILogEventOptions,
  ILogErrorOptions,
  LogLevel,
  LogAttributes,
} from './logger.interfaces';
import { sanitizeAttributes, extractErrorInfo } from './utils/sanitizer.util';

/**
 * Application logger service.
 *
 * Implements both the app-specific IAppLogger interface and NestJS's LoggerService
 * so it can serve as the global NestJS logger. All structured log calls are routed
 * through Pino and/or the active OpenTelemetry span depending on options.
 */
@Injectable()
export class AppLogger implements IAppLogger, LoggerService {
  /** Persistent attributes merged into every log call on this instance. */
  private persistentAttributes: LogAttributes = {};

  /** Context label (e.g. class name) prepended to log messages. */
  private context: string = 'App';

  constructor(private readonly pinoLogger: PinoLogger) {}

  // ─── Context management ───────────────────────────────────────────────────────

  /**
   * Sets the logger context label (e.g. the class or module name).
   */
  setContext(context: string): void {
    this.context = context;
    this.pinoLogger.setContext(context);
  }

  // ─── IAppLogger implementation ────────────────────────────────────────────────

  /**
   * Logs a plain message with optional level override and structured attributes.
   * This is the escape hatch — use it when you need a level other than INFO or ERROR.
   *
   * @example
   * ```typescript
   * logger.log('Process exiting', { level: LogLevel.FATAL, attributes: { pid: process.pid } });
   * logger.log('Queue depth high', { level: LogLevel.WARN, attributes: { depth: 500 } });
   * ```
   */
  log(message: string, options: ILogOptions = {}): void {
    if (options.enabled === false) return;

    const level = options.level ?? LogLevel.INFO;
    const attributes = this.mergeAttributes(options.attributes);

    if (!options.spanOnly) {
      this.writeToPino(level, message, attributes);
    }

    if (!options.logOnly) {
      this.addToActiveSpan(message, attributes);
    }
  }

  /**
   * Logs a named structured event at INFO level and adds it as an OTel span event.
   *
   * @example
   * ```typescript
   * logger.logEvent('user.created', { attributes: { userId, email } });
   * logger.logEvent('cache.invalidated', { attributes: { key }, logOnly: true });
   * ```
   */
  logEvent(eventName: string, options: ILogEventOptions = {}): void {
    if (options.enabled === false) return;

    const level = LogLevel.INFO;
    const attributes = this.mergeAttributes(options.attributes);

    if (!options.spanOnly) {
      this.writeToPino(level, eventName, attributes);
    }

    if (!options.logOnly) {
      const span = trace.getActiveSpan();
      if (span) {
        span.addEvent(eventName, sanitizeAttributes(attributes as Record<string, unknown>));
      }
    }
  }

  /**
   * Logs an error at ERROR level and optionally records it on the active OTel span.
   * For FATAL-level errors, use log() with level: LogLevel.FATAL instead.
   *
   * @example
   * ```typescript
   * logger.logError('payment.failed', error, { attributes: { orderId } });
   * logger.logError('db.query.failed', error, { recordException: false });
   * ```
   */
  logError(eventName: string, error: Error, options: ILogErrorOptions = {}): void {
    if (options.enabled === false) return;

    const level = LogLevel.ERROR;
    const errorAttrs = extractErrorInfo(error);
    const attributes = this.mergeAttributes({ ...options.attributes, ...errorAttrs });

    if (!options.spanOnly) {
      this.writeToPino(level, eventName, attributes, error);
    }

    if (!options.logOnly) {
      const span = trace.getActiveSpan();
      if (span) {
        const recordException = options.recordException !== false;
        if (recordException) {
          span.recordException(error);
        }
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });
        span.addEvent(eventName, sanitizeAttributes(attributes as Record<string, unknown>));
      }
    }
  }

  /**
   * Adds attributes directly to the currently active OTel span.
   */
  addSpanAttributes(attributes: LogAttributes): void {
    const span = trace.getActiveSpan();
    if (span) {
      const sanitized = sanitizeAttributes(attributes as Record<string, unknown>);
      span.setAttributes(
        sanitized as Record<string, string | number | boolean | string[] | number[] | boolean[]>,
      );
    }
  }

  /**
   * Returns a new AppLogger with this logger's persistent attributes merged
   * with the provided context. Does NOT mutate shared/global state.
   *
   * @example
   * ```typescript
   * // Scoped to a specific context string
   * const childLogger = logger.child('PaymentService');
   *
   * // Scoped with persistent attributes merged into every log call
   * const reqLogger = logger.child({ requestId, userId });
   * reqLogger.logEvent('payment.initiated', { attributes: { amount } });
   * ```
   */
  child(context: string | LogAttributes): IAppLogger {
    const childLogger = new AppLogger(this.pinoLogger);
    childLogger.context = this.context;

    if (typeof context === 'string') {
      childLogger.context = context;
      childLogger.pinoLogger.setContext(context);
      childLogger.persistentAttributes = { ...this.persistentAttributes };
    } else {
      childLogger.persistentAttributes = {
        ...this.persistentAttributes,
        ...context,
      };
    }

    return childLogger;
  }

  // ─── NestJS LoggerService implementation ──────────────────────────────────────

  /** NestJS verbose → Pino trace. */
  verbose(message: unknown, context?: string): void {
    this.resolveContext(context);
    this.pinoLogger.trace({ context: context ?? this.context }, String(message));
  }

  /** NestJS debug → Pino debug. */
  debug(message: unknown, context?: string): void {
    this.resolveContext(context);
    this.pinoLogger.debug({ context: context ?? this.context }, String(message));
  }

  /** NestJS warn → Pino warn. */
  warn(message: unknown, context?: string): void {
    this.resolveContext(context);
    this.pinoLogger.warn({ context: context ?? this.context }, String(message));
  }

  /** NestJS error → Pino error. */
  error(message: unknown, stack?: string, context?: string): void {
    this.resolveContext(context);
    this.pinoLogger.error({ context: context ?? this.context, stack }, String(message));
  }

  /** NestJS fatal → Pino fatal. */
  fatal(message: unknown, context?: string): void {
    this.resolveContext(context);
    this.pinoLogger.fatal({ context: context ?? this.context }, String(message));
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  /**
   * Merges the instance's persistent attributes with the call-site attributes.
   */
  private mergeAttributes(callAttributes?: LogAttributes): LogAttributes {
    return {
      ...this.persistentAttributes,
      ...(callAttributes ?? {}),
    };
  }

  /**
   * Dispatches a log call to Pino at the specified level.
   */
  private writeToPino(
    level: LogLevel,
    message: string,
    attributes: LogAttributes,
    error?: Error,
  ): void {
    const meta: Record<string, unknown> = {
      context: this.context,
      ...attributes,
    };

    if (error) {
      meta['err'] = error;
    }

    switch (level) {
      case LogLevel.TRACE:
        this.pinoLogger.trace(meta, message);
        break;
      case LogLevel.DEBUG:
        this.pinoLogger.debug(meta, message);
        break;
      case LogLevel.INFO:
        this.pinoLogger.info(meta, message);
        break;
      case LogLevel.WARN:
        this.pinoLogger.warn(meta, message);
        break;
      case LogLevel.ERROR:
        this.pinoLogger.error(meta, message);
        break;
      case LogLevel.FATAL:
        this.pinoLogger.fatal(meta, message);
        break;
      default:
        this.pinoLogger.info(meta, message);
    }
  }

  /**
   * Adds a log message and attributes to the currently active OTel span as an event.
   */
  private addToActiveSpan(message: string, attributes: LogAttributes): void {
    const span = trace.getActiveSpan();
    if (span) {
      span.addEvent(message, sanitizeAttributes(attributes as Record<string, unknown>));
    }
  }

  /**
   * Resolves a context string — used for NestJS LoggerService compat methods.
   */
  private resolveContext(context?: string): void {
    if (context && context !== this.context) {
      this.pinoLogger.setContext(context);
    }
  }
}
