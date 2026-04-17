import { Span, SpanStatusCode, trace } from '@opentelemetry/api';

import { serialiseErrorChain } from '@errors/utils/cause-chain.util';
import { ErrorException } from '@errors/types/error-exception';

/**
 * Options for {@link recordExceptionOnSpan}.
 */
export interface RecordExceptionOptions {
  /** Target span. Falls back to the currently active span when omitted. */
  readonly span?: Span;
  /** Whether to set the span status to ERROR. Defaults to `true`. */
  readonly setStatus?: boolean;
  /**
   * Optional scrubber applied to every string value (message, stacktrace)
   * before it is attached to an event. Use this to redact PII.
   */
  readonly redactString?: (s: string) => string;
}

/**
 * Emit one `exception` event plus one `exception.cause.N` event per nested
 * cause on the target span, following OTel semantic conventions. Also
 * attaches `error.*` span attributes when the root error is an
 * {@link ErrorException}. Sets span status to ERROR unless
 * `setStatus: false` is passed.
 *
 * Safe to call when no active span is present — it simply no-ops.
 *
 * @param err Any caught value.
 * @param opts See {@link RecordExceptionOptions}.
 *
 * @example
 * ```ts
 * try { await svc.run(); }
 * catch (err) {
 *   recordExceptionOnSpan(err, { redactString: scrub });
 *   throw err;
 * }
 * ```
 */
export function recordExceptionOnSpan(err: unknown, opts: RecordExceptionOptions = {}): void {
  const span = opts.span ?? trace.getActiveSpan();
  if (!span) return;

  const frames = serialiseErrorChain(err);
  if (frames.length === 0) return;

  const scrub = opts.redactString ?? identity;

  frames.forEach((frame, i) => {
    span.addEvent(i === 0 ? 'exception' : `exception.cause.${i}`, {
      'exception.type': frame.name,
      'exception.message': scrub(frame.message),
      'exception.stacktrace': frame.stack ? scrub(frame.stack) : '',
      ...(frame.code != null ? { 'exception.code': frame.code } : {}),
      ...(frame.meta != null ? { 'exception.meta': safeJson(frame.meta) } : {}),
    });
  });

  if (err instanceof ErrorException) {
    span.setAttributes({
      'error.code': err.code,
      'error.type': err.definition.errorType,
      'error.category': err.definition.errorCategory,
      'error.severity': err.definition.severity,
      'error.user_facing': err.definition.userFacing,
      'error.retryable': err.definition.retryable,
      'error.cause_depth': frames.length,
    });
  } else {
    span.setAttribute('error.cause_depth', frames.length);
  }

  if (opts.setStatus !== false) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: frames[0].message });
  }
}

function identity<T>(x: T): T {
  return x;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserialisable]';
  }
}
