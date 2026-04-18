import { Injectable, LoggerService } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { trace, type Attributes } from '@opentelemetry/api';

import { RedactorService } from '@common/redaction/redactor.service';
import { ALLOW_PII_USED_EVENT } from '@common/redaction/redaction.constants';
import { shouldAuditAllowPII } from '@common/redaction/allow-pii.util';
import { recordExceptionOnSpan } from '@telemetry/utils/record-exception.util';

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
 *
 * PII handling: every attribute object passed to `logEvent`/`logError` is run
 * through {@link RedactorService} before being emitted to either Pino or the
 * active span. Exception messages and stack traces are scrubbed via
 * `redactString` when bridged onto span events. Callers who legitimately need
 * a registry-listed PII field in cleartext pass `allowPII: ['*.email']` —
 * each unique `(path, callsite)` pair emits one `security.allow_pii.used`
 * audit INFO line (deduped via {@link shouldAuditAllowPII}).
 */
@Injectable()
export class AppLogger implements IAppLogger, LoggerService {
  /** Persistent attributes merged into every log call on this instance. */
  private persistentAttributes: LogAttributes = {};

  /** Context label (e.g. class name) prepended to log messages. */
  private context: string = 'App';

  constructor(
    private readonly pinoLogger: PinoLogger,
    private readonly redactor: RedactorService,
  ) {}

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
   * Attributes are redacted via {@link RedactorService} before being written
   * to either transport. `allowPII` opts specific registry paths out of
   * redaction for this call and emits a `security.allow_pii.used` audit line
   * per unique `(path, callsite)` pair.
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
    const merged = this.mergeAttributes(options.attributes);
    const redacted = this.redactAttributes(merged, options.allowPII);

    if (options.allowPII && options.allowPII.length > 0) {
      this.auditAllowPII(options.allowPII);
    }

    if (!options.spanOnly) {
      this.writeToPino(level, eventName, redacted);
    }

    if (!options.logOnly) {
      const span = trace.getActiveSpan();
      if (span) {
        span.addEvent(
          eventName,
          sanitizeAttributes(redacted as Record<string, unknown>) as Attributes,
        );
      }
    }
  }

  /**
   * Logs an error at ERROR level and records it on the active OTel span via
   * {@link recordExceptionOnSpan} — which emits `exception` + one
   * `exception.cause.N` event per nested cause, with every string value run
   * through the redactor first.
   *
   * Attributes are redacted via {@link RedactorService}. `allowPII` opts
   * specific registry paths out of redaction for the attribute payload only;
   * message/stacktrace are always scrubbed.
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
    const merged = this.mergeAttributes({ ...options.attributes, ...errorAttrs });
    const redacted = this.redactAttributes(merged, options.allowPII);

    if (options.allowPII && options.allowPII.length > 0) {
      this.auditAllowPII(options.allowPII);
    }

    if (!options.spanOnly) {
      this.writeToPino(level, eventName, redacted, error);
    }

    if (!options.logOnly) {
      const recordException = options.recordException !== false;
      if (recordException) {
        // Emits `exception` + `exception.cause.N` events, sets ERROR status,
        // and attaches `error.*` attributes. Messages and stacktraces are
        // scrubbed via the redactor before they hit the span.
        recordExceptionOnSpan(error, {
          redactString: s => this.redactor.redactString(s),
        });
      }
      // Also emit the caller-supplied event name so the event stream keeps
      // the existing narrative (e.g. "payment.failed") on top of the
      // standard OTel exception event.
      const span = trace.getActiveSpan();
      if (span) {
        span.addEvent(
          eventName,
          sanitizeAttributes(redacted as Record<string, unknown>) as Attributes,
        );
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
    const childLogger = new AppLogger(this.pinoLogger, this.redactor);
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

  /**
   * NestJS warn → Pino warn **and** an OTel `log.warn` span event.
   *
   * Bridging warn/fatal onto the span lets Tempo surface them alongside
   * exception events without forcing callers to switch to `logEvent`.
   * The message is scrubbed via `redactString` before being attached to
   * the span to prevent accidental PII leaks through log.*.
   */
  warn(message: unknown, context?: string): void {
    this.resolveContext(context);
    this.pinoLogger.warn({ context: context ?? this.context }, String(message));
    this.bridgeCompatLogToSpan('log.warn', 'WARN', message);
  }

  /** NestJS error → Pino error. */
  error(message: unknown, stack?: string, context?: string): void {
    this.resolveContext(context);
    this.pinoLogger.error({ context: context ?? this.context, stack }, String(message));
  }

  /**
   * NestJS fatal → Pino fatal **and** an OTel `log.fatal` span event.
   * See {@link warn} for the rationale.
   */
  fatal(message: unknown, context?: string): void {
    this.resolveContext(context);
    this.pinoLogger.fatal({ context: context ?? this.context }, String(message));
    this.bridgeCompatLogToSpan('log.fatal', 'FATAL', message);
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
   * Redact sensitive leaf-key values in an attribute payload before it hits
   * either Pino or the span. Returns a shallow copy so the caller's object
   * is never mutated.
   */
  private redactAttributes(attributes: LogAttributes, allow?: readonly string[]): LogAttributes {
    const copy = { ...attributes } as Record<string, unknown>;
    this.redactor.redactObject(copy, { allow });
    return copy as LogAttributes;
  }

  /**
   * Emit one `security.allow_pii.used` INFO line per unique `(path, callsite)`
   * pair. The callsite is derived from a synthetic `new Error().stack` so
   * grep-friendly source references land in the audit trail without any
   * runtime overhead when `allowPII` is absent.
   */
  private auditAllowPII(allowed: readonly string[]): void {
    const callsite = extractCallsite();
    for (const path of allowed) {
      if (shouldAuditAllowPII(path, callsite)) {
        // Use Pino directly — logEvent would recurse and we want this line
        // tagged with the security event name regardless of the current
        // log-level filter (audit events are always INFO).
        this.pinoLogger.info(
          { context: this.context, event: ALLOW_PII_USED_EVENT, path, callsite },
          ALLOW_PII_USED_EVENT,
        );
      }
    }
  }

  /**
   * Shared helper for `warn`/`fatal` span bridging. Only adds the event when
   * a span is active. The `log.message` attribute is redacted to avoid
   * leaking PII through NestJS's informal `warn('user foo@bar.com tried…')`
   * idiom.
   */
  private bridgeCompatLogToSpan(
    eventName: 'log.warn' | 'log.fatal',
    severity: 'WARN' | 'FATAL',
    message: unknown,
  ): void {
    const span = trace.getActiveSpan();
    if (!span) return;
    const attrs: Record<string, unknown> = { 'log.severity': severity };
    if (typeof message === 'string') {
      attrs['log.message'] = this.redactor.redactString(message);
    }
    span.addEvent(eventName, attrs as Attributes);
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

/**
 * Derive a grep-friendly callsite marker from the current stack, skipping
 * logger-internal frames. Falls back to `'unknown'` when the VM strips
 * stacks (rare — typically only in minified production bundles).
 *
 * The returned shape is `file:line` where possible; exact parsing is
 * deliberately loose so changes in V8's stack formatting don't break the
 * audit layer.
 */
function extractCallsite(): string {
  const stack = new Error().stack;
  if (!stack) return 'unknown';
  const lines = stack.split('\n');
  // Line 0 is "Error", 1 = extractCallsite, 2 = auditAllowPII, 3 = the
  // logger method (logEvent/logError), 4 = the external caller we want.
  const frame = lines[4] ?? lines[lines.length - 1];
  const match = frame?.match(/\(([^)]+)\)/) ?? frame?.match(/at\s+(.+)$/);
  if (match && match[1]) return match[1].trim();
  return frame?.trim() ?? 'unknown';
}
