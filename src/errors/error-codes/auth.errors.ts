import { HttpStatus } from '@nestjs/common';
import { ErrorType, ErrorCategory, ErrorSeverity, ErrorCodeDefinition } from '../interfaces/error.interfaces';

/**
 * Authentication error codes (AUT prefix).
 * All errors relate to identity verification and session management.
 */
export const AUTH_ERRORS = {
  /** No valid authentication credentials were provided */
  UNAUTHENTICATED: {
    code: 'AUT0001',
    message: 'Authentication required',
    httpStatus: HttpStatus.UNAUTHORIZED,
    errorType: ErrorType.AUTHENTICATION,
    errorCategory: ErrorCategory.SECURITY,
    messageKey: 'error.auth.AUT0001.unauthenticated',
    severity: ErrorSeverity.WARNING,
    retryable: false,
    userFacing: true,
  },
  /** Access token has passed its expiry time */
  TOKEN_EXPIRED: {
    code: 'AUT0002',
    message: 'Token expired',
    httpStatus: HttpStatus.UNAUTHORIZED,
    errorType: ErrorType.AUTHENTICATION,
    errorCategory: ErrorCategory.SECURITY,
    messageKey: 'error.auth.AUT0002.token_expired',
    severity: ErrorSeverity.WARNING,
    retryable: false,
    userFacing: true,
  },
  /** Access token is malformed, tampered, or otherwise invalid */
  TOKEN_INVALID: {
    code: 'AUT0003',
    message: 'Token invalid',
    httpStatus: HttpStatus.UNAUTHORIZED,
    errorType: ErrorType.AUTHENTICATION,
    errorCategory: ErrorCategory.SECURITY,
    messageKey: 'error.auth.AUT0003.token_invalid',
    severity: ErrorSeverity.WARNING,
    retryable: false,
    userFacing: true,
  },
  /** Account has been administratively suspended */
  ACCOUNT_SUSPENDED: {
    code: 'AUT0004',
    message: 'Account suspended',
    httpStatus: HttpStatus.FORBIDDEN,
    errorType: ErrorType.AUTHENTICATION,
    errorCategory: ErrorCategory.SECURITY,
    messageKey: 'error.auth.AUT0004.account_suspended',
    severity: ErrorSeverity.ERROR,
    retryable: false,
    userFacing: true,
  },
  /** Account is temporarily locked after too many failed login attempts */
  ACCOUNT_LOCKED: {
    code: 'AUT0005',
    message: 'Account locked',
    httpStatus: HttpStatus.LOCKED,
    errorType: ErrorType.AUTHENTICATION,
    errorCategory: ErrorCategory.SECURITY,
    messageKey: 'error.auth.AUT0005.account_locked',
    severity: ErrorSeverity.ERROR,
    retryable: true,
    userFacing: true,
  },
  /** Provided email/password combination does not match any account */
  INVALID_CREDENTIALS: {
    code: 'AUT0006',
    message: 'Invalid credentials',
    httpStatus: HttpStatus.UNAUTHORIZED,
    errorType: ErrorType.AUTHENTICATION,
    errorCategory: ErrorCategory.SECURITY,
    messageKey: 'error.auth.AUT0006.invalid_credentials',
    severity: ErrorSeverity.WARNING,
    retryable: false,
    userFacing: true,
  },
  /** Account email has not been verified */
  ACCOUNT_NOT_VERIFIED: {
    code: 'AUT0007',
    message: 'Account not verified',
    httpStatus: HttpStatus.FORBIDDEN,
    errorType: ErrorType.AUTHENTICATION,
    errorCategory: ErrorCategory.SECURITY,
    messageKey: 'error.auth.AUT0007.account_not_verified',
    severity: ErrorSeverity.WARNING,
    retryable: false,
    userFacing: true,
  },
} as const satisfies Record<string, ErrorCodeDefinition>;
