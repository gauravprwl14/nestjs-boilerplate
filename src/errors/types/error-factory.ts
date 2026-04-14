import { ZodError } from 'zod';
import { ValidationError } from 'class-validator';
import { AppError, AppErrorOptions } from './app-error';
import { ApiErrorFieldDetail } from '@common/interfaces/api-response.interface';

/**
 * Centralised factory for creating domain-specific AppError instances.
 *
 * All methods create errors using the ERROR_CODES registry via AppError.fromCode().
 * This ensures consistent error codes, messages, and HTTP status codes across the
 * entire application.
 *
 * @example
 * ```typescript
 * throw ErrorFactory.notFound('User', userId);
 * throw ErrorFactory.validation('Email is invalid', [{ field: 'email', message: 'Must be a valid email' }]);
 * ```
 */
export class ErrorFactory {
  // ─── Validation ────────────────────────────────────────────────────────────

  /**
   * General validation error (VAL0001).
   * @param message - Optional override message
   * @param details - Per-field error details
   */
  static validation(message?: string, details?: ApiErrorFieldDetail[]): AppError {
    return AppError.fromCode('VAL0001', { message, details });
  }

  /**
   * Required field is missing (VAL0002).
   * @param field - Name of the required field
   */
  static requiredField(field: string): AppError {
    return AppError.fromCode('VAL0002', {
      message: `Required field missing: ${field}`,
      details: [{ field, message: 'This field is required' }],
    });
  }

  /**
   * Invalid status transition (VAL0004).
   * @param from - Current status value
   * @param to - Attempted target status value
   */
  static invalidStatusTransition(from: string, to: string): AppError {
    return AppError.fromCode('VAL0004', {
      message: `Invalid status transition from '${from}' to '${to}'`,
    });
  }

  // ─── Authentication ─────────────────────────────────────────────────────────

  /**
   * Authentication required (AUT0001).
   * @param message - Optional override message
   */
  static authentication(message?: string): AppError {
    return AppError.fromCode('AUT0001', { message });
  }

  /**
   * Invalid credentials provided (AUT0006).
   */
  static invalidCredentials(): AppError {
    return AppError.fromCode('AUT0006');
  }

  /**
   * Access token has expired (AUT0002).
   */
  static tokenExpired(): AppError {
    return AppError.fromCode('AUT0002');
  }

  /**
   * Access token is invalid or malformed (AUT0003).
   */
  static tokenInvalid(): AppError {
    return AppError.fromCode('AUT0003');
  }

  /**
   * Account has been suspended (AUT0004).
   */
  static accountSuspended(): AppError {
    return AppError.fromCode('AUT0004');
  }

  /**
   * Account has been locked (AUT0005).
   */
  static accountLocked(): AppError {
    return AppError.fromCode('AUT0005');
  }

  // ─── Authorization ──────────────────────────────────────────────────────────

  /**
   * Access is forbidden (AUZ0001).
   * @param message - Optional override message
   */
  static authorization(message?: string): AppError {
    return AppError.fromCode('AUZ0001', { message });
  }

  /**
   * Caller lacks the required permissions (AUZ0002).
   */
  static insufficientPermissions(): AppError {
    return AppError.fromCode('AUZ0002');
  }

  // ─── Data / Database ────────────────────────────────────────────────────────

  /**
   * Requested resource was not found (DAT0001).
   * @param resource - Resource type name (e.g. "User")
   * @param identifier - Optional identifier that was looked up
   */
  static notFound(resource: string, identifier?: string | number): AppError {
    const message = identifier !== undefined
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    return AppError.fromCode('DAT0001', { message });
  }

  /**
   * Resource conflict (DAT0002).
   * @param message - Description of the conflict
   */
  static conflict(message: string): AppError {
    return AppError.fromCode('DAT0002', { message });
  }

  /**
   * Unique constraint violation (DAT0003).
   * @param field - Field that violated the unique constraint
   */
  static uniqueViolation(field: string): AppError {
    return AppError.fromCode('DAT0003', {
      message: `Unique constraint violation on field: ${field}`,
      details: [{ field, message: 'Value already exists' }],
    });
  }

  /**
   * Foreign key constraint violation (DAT0004).
   * @param field - Field that violated the foreign key constraint
   */
  static foreignKeyViolation(field: string): AppError {
    return AppError.fromCode('DAT0004', {
      message: `Foreign key constraint violation on field: ${field}`,
      details: [{ field, message: 'Referenced record does not exist' }],
    });
  }

  /**
   * General database query failure (DAT0007).
   * @param message - Description of the failure
   * @param cause - Original error
   */
  static database(message: string, cause?: Error): AppError {
    return AppError.fromCode('DAT0007', { message, cause, isOperational: false });
  }

  // ─── Server / Infrastructure ────────────────────────────────────────────────

  /**
   * Rate limit exceeded (GEN0001).
   */
  static rateLimited(): AppError {
    return AppError.fromCode('GEN0001');
  }

  /**
   * Unexpected internal server error (SRV0001).
   * isOperational is set to false so the message is masked in API responses.
   * @param cause - Original error that triggered this
   */
  static internal(cause?: Error): AppError {
    return AppError.fromCode('SRV0001', { cause, isOperational: false });
  }

  /**
   * Queue operation failure (SRV0002).
   * @param message - Description of the failure
   * @param cause - Original error
   */
  static queue(message: string, cause?: Error): AppError {
    return AppError.fromCode('SRV0002', { message, cause, isOperational: false });
  }

  /**
   * Cache operation failure (SRV0003).
   * @param message - Description of the failure
   * @param cause - Original error
   */
  static cache(message: string, cause?: Error): AppError {
    return AppError.fromCode('SRV0003', { message, cause, isOperational: false });
  }

  // ─── Schema validation helpers ──────────────────────────────────────────────

  /**
   * Convert a Zod validation error into an AppError with per-field details.
   *
   * @param error - The ZodError to convert
   * @returns An AppError with VAL0001 and field-level details
   */
  static fromZodErrors(error: ZodError): AppError {
    const details: ApiErrorFieldDetail[] = error.issues.map((issue) => ({
      field: issue.path.join('.') || '_root',
      message: issue.message,
    }));

    return AppError.fromCode('VAL0001', {
      message: 'Validation failed',
      details,
    });
  }

  /**
   * Convert class-validator ValidationError[] into an AppError with per-field details.
   * Recursively flattens nested constraint messages.
   *
   * @param errors - Array of class-validator ValidationError instances
   * @returns An AppError with VAL0001 and field-level details
   */
  static fromClassValidatorErrors(errors: ValidationError[]): AppError {
    const details = ErrorFactory.flattenValidationErrors(errors);

    return AppError.fromCode('VAL0001', {
      message: 'Validation failed',
      details,
    });
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Recursively flatten class-validator errors into ApiErrorFieldDetail[].
   */
  private static flattenValidationErrors(
    errors: ValidationError[],
    parentField = '',
  ): ApiErrorFieldDetail[] {
    const details: ApiErrorFieldDetail[] = [];

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
