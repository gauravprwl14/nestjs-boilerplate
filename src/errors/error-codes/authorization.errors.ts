import { HttpStatus } from '@nestjs/common';
import { ErrorType, ErrorCategory, ErrorSeverity, ErrorCodeDefinition } from '../interfaces/error.interfaces';

/**
 * Authorization error codes (AUZ prefix).
 * All errors relate to permission and access-control checks.
 */
export const AUZ = {
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
  /**
   * Caller attempted to read or write a record belonging to another tenant.
   * Fired by the Prisma tenant-scope extension when a write's companyId does
   * not match the CLS-resolved companyId. Should be impossible from the HTTP
   * layer if the middleware + guard are wired — treat as a defensive backstop.
   */
  CROSS_TENANT_ACCESS: {
    code: 'AUZ0004',
    message: 'Cross-tenant access denied',
    httpStatus: HttpStatus.FORBIDDEN,
    errorType: ErrorType.AUTHORIZATION,
    errorCategory: ErrorCategory.SECURITY,
    messageKey: 'error.authorization.AUZ0004.cross_tenant_access',
    severity: ErrorSeverity.ERROR,
    retryable: false,
    userFacing: false,
  },
} as const satisfies Record<string, ErrorCodeDefinition>;
