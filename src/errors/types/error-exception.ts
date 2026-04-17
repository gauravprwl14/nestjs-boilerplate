import { ErrorCodeDefinition, ErrorFieldDetail } from '../interfaces/error.interfaces';
import { DAT } from '../error-codes/database.errors';
import { SRV } from '../error-codes/server.errors';
import { VAL } from '../error-codes/validation.errors';
import { serialiseErrorChain, SerialisedErrorFrame } from '../utils/cause-chain.util';

/**
 * Options for constructing an ErrorException instance.
 */
export interface ErrorExceptionOptions {
  /** Override the default message from the definition */
  message?: string;
  /** Per-field validation details */
  details?: ErrorFieldDetail[];
  /** Original error that caused this error */
  cause?: Error;
}

/**
 * Core application error class. Does NOT extend HttpException — works in
 * HTTP controllers, queue workers, background jobs, and anywhere else.
 *
 * The filter reads `statusCode` from this class. `userFacing` on the definition
 * controls message masking in responses (replaces the old `isOperational` flag).
 *
 * @example
 * ```typescript
 * import { AUT, DAT, VAL } from '@errors/error-codes';
 *
 * throw new ErrorException(AUT.UNAUTHENTICATED);
 * throw new ErrorException(DAT.NOT_FOUND, { message: `User ${id} not found` });
 * throw ErrorException.notFound('User', id);
 * ```
 */
export class ErrorException extends Error {
  /** The error code definition — single source of truth for all metadata */
  readonly definition: ErrorCodeDefinition;
  /** HTTP status code (from definition) */
  readonly statusCode: number;
  /** Domain-prefixed error code string (e.g. 'DAT0001') */
  readonly code: string;
  /** Per-field validation details */
  readonly details?: ErrorFieldDetail[];
  /** Original error that caused this */
  override readonly cause?: Error;

  constructor(definition: ErrorCodeDefinition, options?: ErrorExceptionOptions) {
    super(options?.message ?? definition.message);
    this.name = 'ErrorException';
    this.definition = definition;
    this.code = definition.code;
    this.statusCode = definition.httpStatus;
    this.details = options?.details;
    this.cause = options?.cause;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ErrorException);
    }

    // Preserve the origin frames by appending the cause's stack trace. Without
    // this, rethrow-as-ErrorException wipes the leaf stack and the observability
    // pipeline shows only the wrap site. Guarded: the cause may be a non-Error
    // value (plain object, undefined) or an Error without a `stack` property.
    const causeStack = (options?.cause as Error | undefined)?.stack;
    if (causeStack) {
      this.stack = `${this.stack ?? ''}\nCaused by: ${causeStack}`;
    }
  }

  // ─── Static helpers (only for common parameterized patterns) ───────────

  /** Resource not found. Formats message with resource name and optional identifier. */
  static notFound(resource: string, identifier?: string | number): ErrorException {
    const msg =
      identifier != null
        ? `${resource} with identifier '${identifier}' not found`
        : `${resource} not found`;
    return new ErrorException(DAT.NOT_FOUND, { message: msg });
  }

  /** Validation error from Zod. Extracts field-level details from ZodError. */
  static validation(error: {
    issues: Array<{ path: PropertyKey[]; message: string }>;
  }): ErrorException {
    const details: ErrorFieldDetail[] = error.issues.map(
      (issue: { path: PropertyKey[]; message: string }) => ({
        field: issue.path.map(String).join('.') || '_root',
        message: issue.message,
      }),
    );
    return new ErrorException(VAL.INVALID_INPUT, { message: 'Validation failed', details });
  }

  /** Validation error from class-validator. Recursively flattens nested errors. */
  static validationFromCV(
    errors: Array<{ property: string; constraints?: Record<string, string>; children?: any[] }>,
  ): ErrorException {
    const details = flattenCVErrors(errors);
    return new ErrorException(VAL.INVALID_INPUT, { message: 'Validation failed', details });
  }

  /** Internal server error. Wraps unexpected errors. */
  static internal(cause?: Error): ErrorException {
    return new ErrorException(SRV.INTERNAL_ERROR, { cause });
  }

  /** Wrap any unknown value into an ErrorException. Returns as-is if already one. */
  static wrap(error: unknown): ErrorException {
    if (error instanceof ErrorException) return error;
    const cause = error instanceof Error ? error : new Error(String(error));
    return new ErrorException(SRV.INTERNAL_ERROR, { cause });
  }

  /** Type guard */
  static isErrorException(error: unknown): error is ErrorException {
    return error instanceof ErrorException;
  }

  // ─── Response building (filter calls this — filter stays thin) ─────────

  /**
   * Build the API error response object.
   * The filter just calls this and sends the result.
   *
   * @param includeChain - When true, includes cause chain (use in non-production)
   */
  toResponse(includeChain = false): {
    code: string;
    message: string;
    errorType: string;
    errorCategory: string;
    retryable: boolean;
    details?: ErrorFieldDetail[];
    cause?: { code?: string; message: string }[];
  } {
    // If not userFacing, mask the message
    const message = this.definition.userFacing ? this.message : SRV.INTERNAL_ERROR.message;

    const response: Record<string, unknown> = {
      code: this.code,
      message,
      errorType: this.definition.errorType,
      errorCategory: this.definition.errorCategory,
      retryable: this.definition.retryable,
    };

    if (this.details?.length) {
      response.details = this.details;
    }

    // Cause chain — delegated to the shared serialiser; response shape is
    // preserved as `{ code?, message }[]` with a trailing truncation marker
    // when the underlying chain is deeper than `maxDepth`.
    if (includeChain && this.cause) {
      response.cause = buildResponseCauseChain(this.cause, 5);
    }

    return response as ReturnType<ErrorException['toResponse']>;
  }

  /** Build a log-safe representation (always includes full chain) */
  toLog(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      errorType: this.definition.errorType,
      errorCategory: this.definition.errorCategory,
      severity: this.definition.severity,
      details: this.details,
      stack: this.stack,
      cause: this.cause ? buildResponseCauseChain(this.cause, 10) : undefined,
    };
  }
}

/**
 * Adapt the shared {@link serialiseErrorChain} output to the legacy
 * `{ code?, message }[]` shape returned by `toResponse`/`toLog`. Appends a
 * `[truncated at depth N]` marker when the underlying chain was longer than
 * `maxDepth`, matching the previous behaviour so existing callers and tests
 * keep working.
 */
function buildResponseCauseChain(
  error: Error,
  maxDepth: number,
): Array<{ code?: string; message: string }> {
  // Walk one deeper than the caller asked for so we can detect truncation
  // without having to re-traverse the chain.
  const frames = serialiseErrorChain(error, maxDepth + 1);
  const capped = frames.slice(0, maxDepth);
  const chain = capped.map(toResponseFrame);
  if (frames.length > maxDepth) {
    chain.push({ message: `[truncated at depth ${maxDepth}]` });
  }
  return chain;
}

function toResponseFrame(frame: SerialisedErrorFrame): { code?: string; message: string } {
  const entry: { code?: string; message: string } = { message: frame.message };
  if (frame.code != null) entry.code = frame.code;
  return entry;
}

/** Recursively flatten class-validator errors */
function flattenCVErrors(
  errors: Array<{ property: string; constraints?: Record<string, string>; children?: any[] }>,
  parentField = '',
): ErrorFieldDetail[] {
  const details: ErrorFieldDetail[] = [];
  for (const error of errors) {
    const field = parentField ? `${parentField}.${error.property}` : error.property;
    if (error.constraints) {
      details.push({ field, message: Object.values(error.constraints).join('; ') });
    }
    if (error.children?.length) {
      details.push(...flattenCVErrors(error.children, field));
    }
  }
  return details;
}
