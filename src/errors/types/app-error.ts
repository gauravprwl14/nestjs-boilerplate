import { HttpException } from '@nestjs/common';
import { ERROR_CODES, ErrorCodeKey } from '@common/constants/error-codes';
import { ApiErrorDetail, ApiErrorFieldDetail } from '@common/interfaces/api-response.interface';

/**
 * Options for constructing an AppError instance.
 */
export interface AppErrorOptions {
  /** Per-field validation details */
  details?: ApiErrorFieldDetail[];
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
 * All errors in the system should ultimately be represented as AppError instances.
 * Use ErrorFactory for convenient factory methods or AppError.fromCode() to create
 * from the ERROR_CODES registry.
 *
 * @example
 * ```typescript
 * throw AppError.fromCode('DAT0001', { message: 'User not found' });
 * throw ErrorFactory.notFound('User', userId);
 * ```
 */
export class AppError extends HttpException {
  /** Domain-prefixed error code (e.g. "VAL0001") */
  readonly code: string;

  /** HTTP status code */
  readonly statusCode: number;

  /** Per-field validation error details */
  readonly details?: ApiErrorFieldDetail[];

  /** Original error that caused this error */
  readonly cause?: Error;

  /**
   * Whether this is an operational (expected) error.
   * Non-operational errors have their messages masked in API responses.
   */
  readonly isOperational: boolean;

  /**
   * @param code - Domain-prefixed error code string
   * @param message - Human-readable error message
   * @param statusCode - HTTP status code
   * @param options - Additional error options
   */
  constructor(
    code: string,
    message: string,
    statusCode: number,
    options: AppErrorOptions = {},
  ) {
    super(message, statusCode);
    this.code = code;
    this.statusCode = statusCode;
    this.details = options.details;
    this.cause = options.cause;
    this.isOperational = options.isOperational ?? true;

    // Capture the stack trace, excluding this constructor call
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  /**
   * Create an AppError from the ERROR_CODES registry.
   *
   * @param key - Key of the error code in ERROR_CODES
   * @param overrides - Optional overrides for message and options
   * @returns A new AppError instance
   *
   * @example
   * ```typescript
   * throw AppError.fromCode('DAT0001', { message: 'User not found' });
   * ```
   */
  static fromCode(
    key: ErrorCodeKey,
    overrides?: { message?: string } & AppErrorOptions,
  ): AppError {
    const def = ERROR_CODES[key];
    const { message, ...options } = overrides ?? {};
    return new AppError(def.code, message ?? def.message, def.statusCode, options);
  }

  /**
   * Wrap an unknown error into an AppError.
   * If the error is already an AppError, it is returned as-is.
   * Otherwise, a generic internal server error (SRV0001) is created.
   *
   * @param error - The unknown error to wrap
   * @returns An AppError instance
   */
  static wrap(error: unknown): AppError {
    if (AppError.isAppError(error)) {
      return error;
    }

    const cause = error instanceof Error ? error : new Error(String(error));
    return AppError.fromCode('SRV0001', { cause, isOperational: false });
  }

  /**
   * Type guard to check whether a value is an AppError instance.
   *
   * @param error - The value to check
   * @returns True if the value is an AppError
   */
  static isAppError(error: unknown): error is AppError {
    return error instanceof AppError;
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
      details: this.details,
      stack: this.stack,
      cause: this.cause
        ? {
            message: this.cause.message,
            stack: this.cause.stack,
          }
        : undefined,
    };
  }

  /**
   * Convert the error into the ApiErrorDetail shape for API responses.
   * Non-operational error messages are masked with a generic message.
   *
   * @param requestId - Optional request identifier to include in the response
   * @param traceId - Optional trace identifier to include in the response
   * @returns ApiErrorDetail object ready for serialisation
   */
  toResponse(requestId?: string, traceId?: string): ApiErrorDetail {
    const message = this.isOperational
      ? this.message
      : ERROR_CODES.SRV0001.message;

    return {
      code: this.code,
      message,
      details: this.details,
      requestId,
      traceId,
    };
  }
}
