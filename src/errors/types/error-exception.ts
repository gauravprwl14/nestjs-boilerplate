import { HttpException } from '@nestjs/common';
import { ErrorCodeDefinition, ErrorFieldDetail } from '../interfaces/error.interfaces';
import { ERROR_CODES, ErrorCodeKey, getErrorDefinition } from '../error-codes';

/**
 * Options for constructing an ErrorException instance.
 */
export interface ErrorExceptionOptions {
  /** Per-field validation details */
  details?: ErrorFieldDetail[];
  /** Original error that caused this error */
  cause?: Error;
  /**
   * Whether this error is an expected, operational error (e.g. validation, 404).
   * Non-operational errors are internal/unexpected and their messages are masked in responses.
   * @default true
   */
  isOperational?: boolean;
}

/**
 * Application-level error class that extends NestJS HttpException.
 *
 * All errors in the system should ultimately be represented as ErrorException instances.
 * Use ErrorFactory for convenient factory methods, or ErrorException.fromCode() to
 * construct directly from the ERROR_CODES registry using a dot-notation key.
 *
 * The GlobalExceptionsFilter catches all ErrorException instances and serialises them
 * to a standardised ApiErrorResponse shape. Non-operational errors have their messages
 * masked to prevent leaking internal details to clients.
 *
 * Error code format: PREFIX + 4-digit zero-padded number (e.g. VAL0001, DAT0003).
 * Prefix registry: GEN, VAL, AUT, AUZ, DAT, SRV.
 *
 * @example
 * ```typescript
 * // Create from dot-notation error code key
 * throw ErrorException.fromCode('DAT.NOT_FOUND', { message: 'User not found' });
 *
 * // Use the factory (preferred for common cases)
 * throw ErrorFactory.notFound('User', userId);
 *
 * // Wrap an unknown caught value
 * const err = ErrorException.wrap(unknownCaughtValue);
 *
 * // Type guard in filters/middleware
 * if (ErrorException.isErrorException(exception)) {
 *   return exception.toResponse();
 * }
 * ```
 */
export class ErrorException extends HttpException {
  /** Domain-prefixed error code (e.g. "VAL0001") */
  readonly code: string;

  /** HTTP status code */
  readonly statusCode: number;

  /** Per-field validation error details */
  readonly details?: ErrorFieldDetail[];

  /** Original error that caused this error */
  declare readonly cause: unknown;

  /** Full error code definition for metadata access */
  readonly errorDefinition?: ErrorCodeDefinition;

  /**
   * Whether this is an operational (expected) error.
   * Non-operational errors have their messages masked in API responses.
   */
  readonly isOperational: boolean;

  /**
   * @param code - Domain-prefixed error code string (e.g. "VAL0001")
   * @param message - Human-readable error message
   * @param statusCode - HTTP status code
   * @param options - Additional error options
   * @param errorDefinition - Full error definition for metadata (optional)
   */
  constructor(
    code: string,
    message: string,
    statusCode: number,
    options: ErrorExceptionOptions = {},
    errorDefinition?: ErrorCodeDefinition,
  ) {
    super(message, statusCode);
    this.code = code;
    this.statusCode = statusCode;
    this.details = options.details;
    this.cause = options.cause;
    this.isOperational = options.isOperational ?? true;
    this.errorDefinition = errorDefinition;

    // Capture the stack trace, excluding this constructor call
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ErrorException);
    }
  }

  /**
   * Create an ErrorException from the ERROR_CODES registry using a dot-notation key.
   *
   * @param key - Dot-notation key such as `'DAT.NOT_FOUND'` or `'VAL.INVALID_INPUT'`
   * @param overrides - Optional message override and additional options
   * @returns A new ErrorException instance
   *
   * @example
   * ```typescript
   * throw ErrorException.fromCode('DAT.NOT_FOUND', { message: 'User not found' });
   * ```
   */
  static fromCode(
    key: ErrorCodeKey,
    overrides?: { message?: string } & ErrorExceptionOptions,
  ): ErrorException {
    const def = getErrorDefinition(key);
    const { message, ...options } = overrides ?? {};
    return new ErrorException(
      def.code,
      message ?? def.message,
      def.httpStatus,
      options,
      def,
    );
  }

  /**
   * Wrap an unknown error into an ErrorException.
   * If the error is already an ErrorException, it is returned as-is.
   * Otherwise, a generic internal server error (SRV.INTERNAL_ERROR) is created.
   *
   * @param error - The unknown error to wrap
   * @returns An ErrorException instance
   */
  static wrap(error: unknown): ErrorException {
    if (ErrorException.isErrorException(error)) {
      return error;
    }

    const cause = error instanceof Error ? error : new Error(String(error));
    return ErrorException.fromCode('SRV.INTERNAL_ERROR', { cause, isOperational: false });
  }

  /**
   * Type guard to check whether a value is an ErrorException instance.
   *
   * @param error - The value to check
   * @returns True if the value is an ErrorException
   */
  static isErrorException(error: unknown): error is ErrorException {
    return error instanceof ErrorException;
  }

  /**
   * Return a safe object suitable for structured logging.
   * Includes the cause stack trace if available.
   *
   * @returns Plain object representation for logging
   */
  toLog(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      isOperational: this.isOperational,
      errorType: this.errorDefinition?.errorType,
      errorCategory: this.errorDefinition?.errorCategory,
      severity: this.errorDefinition?.severity,
      details: this.details,
      stack: this.stack,
      cause: this.cause instanceof Error
        ? {
            message: this.cause.message,
            stack: this.cause.stack,
          }
        : undefined,
    };
  }

  /**
   * Convert the error into a response-safe detail object.
   * Non-operational error messages are masked with the generic internal error message.
   *
   * @returns Response-safe error detail object
   */
  toResponse(): {
    code: string;
    message: string;
    errorType?: string;
    errorCategory?: string;
    details?: ErrorFieldDetail[];
  } {
    const message = this.isOperational
      ? this.message
      : ERROR_CODES.SRV.INTERNAL_ERROR.message;

    return {
      code: this.code,
      message,
      errorType: this.errorDefinition?.errorType,
      errorCategory: this.errorDefinition?.errorCategory,
      details: this.details,
    };
  }
}
