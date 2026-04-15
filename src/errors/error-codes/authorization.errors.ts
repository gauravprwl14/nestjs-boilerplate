import { HttpStatus } from '@nestjs/common';
import { ErrorType, ErrorCategory, ErrorSeverity, ErrorCodeDefinition } from '../interfaces/error.interfaces';

/**
 * Authorization error codes (AUZ prefix).
 * All errors relate to permission and access-control checks.
 */
export const AUTHORIZATION_ERRORS = {
  /** Caller is authenticated but access to the resource is denied */
  FORBIDDEN: {
    code: 'AUZ0001',
    message: 'Access forbidden',
    httpStatus: HttpStatus.FORBIDDEN,
    errorType: ErrorType.AUTHORIZATION,
    errorCategory: ErrorCategory.SECURITY,
    messageKey: 'error.authorization.AUZ0001.forbidden',
    severity: ErrorSeverity.WARNING,
    retryable: false,
    userFacing: true,
  },
  /** Caller does not hold the permissions required for this action */
  INSUFFICIENT_PERMISSIONS: {
    code: 'AUZ0002',
    message: 'Insufficient permissions',
    httpStatus: HttpStatus.FORBIDDEN,
    errorType: ErrorType.AUTHORIZATION,
    errorCategory: ErrorCategory.SECURITY,
    messageKey: 'error.authorization.AUZ0002.insufficient_permissions',
    severity: ErrorSeverity.WARNING,
    retryable: false,
    userFacing: true,
  },
  /** A specific role is required to perform this action */
  ROLE_REQUIRED: {
    code: 'AUZ0003',
    message: 'Role required',
    httpStatus: HttpStatus.FORBIDDEN,
    errorType: ErrorType.AUTHORIZATION,
    errorCategory: ErrorCategory.SECURITY,
    messageKey: 'error.authorization.AUZ0003.role_required',
    severity: ErrorSeverity.WARNING,
    retryable: false,
    userFacing: true,
  },
} as const satisfies Record<string, ErrorCodeDefinition>;
