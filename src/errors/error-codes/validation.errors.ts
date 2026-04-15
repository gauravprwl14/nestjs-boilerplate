import { HttpStatus } from '@nestjs/common';
import { ErrorType, ErrorCategory, ErrorSeverity, ErrorCodeDefinition } from '../interfaces/error.interfaces';

/**
 * Validation error codes (VAL prefix).
 * All errors relate to invalid or missing input data.
 */
export const VALIDATION_ERRORS = {
  /** General invalid input — catch-all for validation failures */
  INVALID_INPUT: {
    code: 'VAL0001',
    message: 'Invalid input',
    httpStatus: HttpStatus.BAD_REQUEST,
    errorType: ErrorType.VALIDATION,
    errorCategory: ErrorCategory.CLIENT,
    messageKey: 'error.validation.VAL0001.invalid_input',
    severity: ErrorSeverity.WARNING,
    retryable: false,
    userFacing: true,
  },
  /** A required field was not provided */
  REQUIRED_FIELD: {
    code: 'VAL0002',
    message: 'Required field missing',
    httpStatus: HttpStatus.BAD_REQUEST,
    errorType: ErrorType.VALIDATION,
    errorCategory: ErrorCategory.CLIENT,
    messageKey: 'error.validation.VAL0002.required_field',
    severity: ErrorSeverity.WARNING,
    retryable: false,
    userFacing: true,
  },
  /** Field value exceeds the maximum allowed length */
  FIELD_TOO_LONG: {
    code: 'VAL0003',
    message: 'Field exceeds maximum length',
    httpStatus: HttpStatus.BAD_REQUEST,
    errorType: ErrorType.VALIDATION,
    errorCategory: ErrorCategory.CLIENT,
    messageKey: 'error.validation.VAL0003.field_too_long',
    severity: ErrorSeverity.WARNING,
    retryable: false,
    userFacing: true,
  },
  /** Attempted status transition is not permitted from the current state */
  INVALID_STATUS_TRANSITION: {
    code: 'VAL0004',
    message: 'Invalid status transition',
    httpStatus: HttpStatus.BAD_REQUEST,
    errorType: ErrorType.BUSINESS_LOGIC,
    errorCategory: ErrorCategory.CLIENT,
    messageKey: 'error.validation.VAL0004.invalid_status_transition',
    severity: ErrorSeverity.WARNING,
    retryable: false,
    userFacing: true,
  },
  /** Value does not match the expected format (e.g., UUID, email, date) */
  INVALID_FORMAT: {
    code: 'VAL0005',
    message: 'Invalid format',
    httpStatus: HttpStatus.BAD_REQUEST,
    errorType: ErrorType.VALIDATION,
    errorCategory: ErrorCategory.CLIENT,
    messageKey: 'error.validation.VAL0005.invalid_format',
    severity: ErrorSeverity.WARNING,
    retryable: false,
    userFacing: true,
  },
  /** Value is of the wrong type (e.g., string where number is expected) */
  INVALID_TYPE: {
    code: 'VAL0006',
    message: 'Invalid type',
    httpStatus: HttpStatus.BAD_REQUEST,
    errorType: ErrorType.VALIDATION,
    errorCategory: ErrorCategory.CLIENT,
    messageKey: 'error.validation.VAL0006.invalid_type',
    severity: ErrorSeverity.WARNING,
    retryable: false,
    userFacing: true,
  },
} as const satisfies Record<string, ErrorCodeDefinition>;
