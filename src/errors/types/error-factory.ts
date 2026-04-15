import { ZodError } from 'zod';
import { ValidationError } from 'class-validator';
import { ErrorException, ErrorExceptionOptions } from './error-exception';
import { ErrorFieldDetail } from '../interfaces/error.interfaces';

/**
 * Centralised factory for creating domain-specific ErrorException instances.
 *
 * All methods create errors using the ERROR_CODES registry via ErrorException.fromCode().
 * This ensures consistent error codes, messages, and HTTP status codes across the
 * entire application.
 *
 * Prefer ErrorFactory methods over calling ErrorException.fromCode() directly —
 * they provide semantic, type-safe shortcuts for every common error scenario.
 *
 * @example
 * ```typescript
 * // Throw a 404 for a specific resource
 * throw ErrorFactory.notFound('User', userId);
 *
 * // Throw a validation error with field-level details
 * throw ErrorFactory.validation('Email is invalid', [
 *   { field: 'email', message: 'Must be a valid email' },
 * ]);
 *
 * // Throw from a Zod parse result
 * const result = schema.safeParse(body);
 * if (!result.success) throw ErrorFactory.fromZodErrors(result.error);
 *
 * // Wrap an unexpected database error
 * throw ErrorFactory.database('Failed to fetch records', cause);
 * ```
 */
export class ErrorFactory {
  // ─── Validation ────────────────────────────────────────────────────────────

  /**
   * General validation error (VAL.INVALID_INPUT / VAL0001).
   * @param message - Optional override message
   * @param details - Per-field error details
   */
  static validation(message?: string, details?: ErrorFieldDetail[]): ErrorException {
    return ErrorException.fromCode('VAL.INVALID_INPUT', { message, details });
  }

  /**
   * Required field is missing (VAL.REQUIRED_FIELD / VAL0002).
   * @param field - Name of the required field
   */
  static requiredField(field: string): ErrorException {
    return ErrorException.fromCode('VAL.REQUIRED_FIELD', {
      message: `Required field missing: ${field}`,
      details: [{ field, message: 'This field is required' }],
    });
  }

  /**
   * Invalid status transition (VAL.INVALID_STATUS_TRANSITION / VAL0004).
   * @param from - Current status value
   * @param to - Attempted target status value
   */
  static invalidStatusTransition(from: string, to: string): ErrorException {
    return ErrorException.fromCode('VAL.INVALID_STATUS_TRANSITION', {
      message: `Invalid status transition from '${from}' to '${to}'`,
    });
  }

  // ─── Authentication ─────────────────────────────────────────────────────────

  /**
   * Authentication required (AUT.UNAUTHENTICATED / AUT0001).
   * @param message - Optional override message
   */
  static authentication(message?: string): ErrorException {
    return ErrorException.fromCode('AUT.UNAUTHENTICATED', { message });
  }

  /**
   * Invalid credentials provided (AUT.INVALID_CREDENTIALS / AUT0006).
   */
  static invalidCredentials(): ErrorException {
    return ErrorException.fromCode('AUT.INVALID_CREDENTIALS');
  }

  /**
   * Access token has expired (AUT.TOKEN_EXPIRED / AUT0002).
   */
  static tokenExpired(): ErrorException {
    return ErrorException.fromCode('AUT.TOKEN_EXPIRED');
  }

  /**
   * Access token is invalid or malformed (AUT.TOKEN_INVALID / AUT0003).
   */
  static tokenInvalid(): ErrorException {
    return ErrorException.fromCode('AUT.TOKEN_INVALID');
  }

  /**
   * Account has been suspended (AUT.ACCOUNT_SUSPENDED / AUT0004).
   */
  static accountSuspended(): ErrorException {
    return ErrorException.fromCode('AUT.ACCOUNT_SUSPENDED');
  }

  /**
   * Account has been locked (AUT.ACCOUNT_LOCKED / AUT0005).
   */
  static accountLocked(): ErrorException {
    return ErrorException.fromCode('AUT.ACCOUNT_LOCKED');
  }

  // ─── Authorization ──────────────────────────────────────────────────────────

  /**
   * Access is forbidden (AUZ.FORBIDDEN / AUZ0001).
   * @param message - Optional override message
   */
  static authorization(message?: string): ErrorException {
    return ErrorException.fromCode('AUZ.FORBIDDEN', { message });
  }

  /**
   * Caller lacks the required permissions (AUZ.INSUFFICIENT_PERMISSIONS / AUZ0002).
   */
  static insufficientPermissions(): ErrorException {
    return ErrorException.fromCode('AUZ.INSUFFICIENT_PERMISSIONS');
  }

  // ─── Data / Database ────────────────────────────────────────────────────────

  /**
   * Requested resource was not found (DAT.NOT_FOUND / DAT0001).
   * @param resource - Resource type name (e.g. "User")
   * @param identifier - Optional identifier that was looked up
   */
  static notFound(resource: string, identifier?: string | number): ErrorException {
    const message = identifier !== undefined
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    return ErrorException.fromCode('DAT.NOT_FOUND', { message });
  }

  /**
   * Resource conflict (DAT.CONFLICT / DAT0002).
   * @param message - Description of the conflict
   */
  static conflict(message: string): ErrorException {
    return ErrorException.fromCode('DAT.CONFLICT', { message });
  }

  /**
   * Unique constraint violation (DAT.UNIQUE_VIOLATION / DAT0003).
   * @param field - Field that violated the unique constraint
   */
  static uniqueViolation(field: string): ErrorException {
    return ErrorException.fromCode('DAT.UNIQUE_VIOLATION', {
      message: `Unique constraint violation on field: ${field}`,
      details: [{ field, message: 'Value already exists' }],
    });
  }

  /**
   * Foreign key constraint violation (DAT.FOREIGN_KEY_VIOLATION / DAT0004).
   * @param field - Field that violated the foreign key constraint
   */
  static foreignKeyViolation(field: string): ErrorException {
    return ErrorException.fromCode('DAT.FOREIGN_KEY_VIOLATION', {
      message: `Foreign key constraint violation on field: ${field}`,
      details: [{ field, message: 'Referenced record does not exist' }],
    });
  }

  /**
   * General database query failure (DAT.QUERY_FAILED / DAT0007).
   * @param message - Description of the failure
   * @param cause - Original error
   */
  static database(message: string, cause?: Error): ErrorException {
    return ErrorException.fromCode('DAT.QUERY_FAILED', { message, cause, isOperational: false });
  }

  // ─── Server / Infrastructure ────────────────────────────────────────────────

  /**
   * Rate limit exceeded (GEN.RATE_LIMITED / GEN0001).
   */
  static rateLimited(): ErrorException {
    return ErrorException.fromCode('GEN.RATE_LIMITED');
  }

  /**
   * Unexpected internal server error (SRV.INTERNAL_ERROR / SRV0001).
   * isOperational is set to false so the message is masked in API responses.
   * @param cause - Original error that triggered this
   */
  static internal(cause?: Error): ErrorException {
    return ErrorException.fromCode('SRV.INTERNAL_ERROR', { cause, isOperational: false });
  }

  /**
   * Queue operation failure (SRV.QUEUE_ERROR / SRV0002).
   * @param message - Description of the failure
   * @param cause - Original error
   */
  static queue(message: string, cause?: Error): ErrorException {
    return ErrorException.fromCode('SRV.QUEUE_ERROR', { message, cause, isOperational: false });
  }

  /**
   * Cache operation failure (SRV.CACHE_ERROR / SRV0003).
   * @param message - Description of the failure
   * @param cause - Original error
   */
  static cache(message: string, cause?: Error): ErrorException {
    return ErrorException.fromCode('SRV.CACHE_ERROR', { message, cause, isOperational: false });
  }

  // ─── Schema validation helpers ──────────────────────────────────────────────

  /**
   * Convert a Zod validation error into an ErrorException with per-field details.
   *
   * @param error - The ZodError to convert
   * @returns An ErrorException with VAL0001 and field-level details
   */
  static fromZodErrors(error: ZodError): ErrorException {
    const details: ErrorFieldDetail[] = error.issues.map((issue) => ({
      field: issue.path.join('.') || '_root',
      message: issue.message,
    }));

    return ErrorException.fromCode('VAL.INVALID_INPUT', {
      message: 'Validation failed',
      details,
    });
  }

  /**
   * Convert class-validator ValidationError[] into an ErrorException with per-field details.
   * Recursively flattens nested constraint messages.
   *
   * @param errors - Array of class-validator ValidationError instances
   * @returns An ErrorException with VAL0001 and field-level details
   */
  static fromClassValidatorErrors(errors: ValidationError[]): ErrorException {
    const details = ErrorFactory.flattenValidationErrors(errors);

    return ErrorException.fromCode('VAL.INVALID_INPUT', {
      message: 'Validation failed',
      details,
    });
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Recursively flatten class-validator errors into ErrorFieldDetail[].
   */
  private static flattenValidationErrors(
    errors: ValidationError[],
    parentField = '',
  ): ErrorFieldDetail[] {
    const details: ErrorFieldDetail[] = [];

    for (const error of errors) {
      const field = parentField ? `${parentField}.${error.property}` : error.property;

      if (error.constraints) {
        const messages = Object.values(error.constraints);
        details.push({ field, message: messages.join('; ') });
      }

      if (error.children && error.children.length > 0) {
        details.push(...ErrorFactory.flattenValidationErrors(error.children, field));
      }
    }

    return details;
  }
}
