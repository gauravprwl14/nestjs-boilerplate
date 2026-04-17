import { HttpStatus } from '@nestjs/common';
import { ErrorType, ErrorCategory, ErrorSeverity, ErrorCodeDefinition } from '../interfaces/error.interfaces';

/**
 * Database error codes (DAT prefix).
 * All errors relate to persistence-layer operations.
 */
export const DAT = {
  /** The requested resource could not be found */
  NOT_FOUND: {
    code: 'DAT0001',
    message: 'Resource not found',
    httpStatus: HttpStatus.NOT_FOUND,
    errorType: ErrorType.DATABASE,
    errorCategory: ErrorCategory.CLIENT,
    messageKey: 'error.database.DAT0001.not_found',
    severity: ErrorSeverity.WARNING,
    retryable: false,
    userFacing: true,
  },
  /** A conflicting resource already exists */
  CONFLICT: {
    code: 'DAT0002',
    message: 'Resource conflict',
    httpStatus: HttpStatus.CONFLICT,
    errorType: ErrorType.DATABASE,
    errorCategory: ErrorCategory.CLIENT,
    messageKey: 'error.database.DAT0002.conflict',
    severity: ErrorSeverity.WARNING,
    retryable: false,
    userFacing: true,
  },
  /** A unique database constraint was violated */
  UNIQUE_VIOLATION: {
    code: 'DAT0003',
    message: 'Unique constraint violation',
    httpStatus: HttpStatus.CONFLICT,
    errorType: ErrorType.DATABASE,
    errorCategory: ErrorCategory.CLIENT,
    messageKey: 'error.database.DAT0003.unique_violation',
    severity: ErrorSeverity.WARNING,
    retryable: false,
    userFacing: true,
  },
  /** A foreign key constraint was violated */
  FOREIGN_KEY_VIOLATION: {
    code: 'DAT0004',
    message: 'Foreign key constraint violation',
    httpStatus: HttpStatus.BAD_REQUEST,
    errorType: ErrorType.DATABASE,
    errorCategory: ErrorCategory.CLIENT,
    messageKey: 'error.database.DAT0004.foreign_key_violation',
    severity: ErrorSeverity.WARNING,
    retryable: false,
    userFacing: true,
  },
  /** A database transaction could not be committed */
  TRANSACTION_FAILED: {
    code: 'DAT0005',
    message: 'Transaction failed',
    httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    errorType: ErrorType.DATABASE,
    errorCategory: ErrorCategory.DATABASE,
    messageKey: 'error.database.DAT0005.transaction_failed',
    severity: ErrorSeverity.ERROR,
    retryable: true,
    userFacing: false,
  },
  /** Cannot establish a connection to the database */
  CONNECTION_FAILED: {
    code: 'DAT0006',
    message: 'Database connection failed',
    httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
    errorType: ErrorType.DATABASE,
    errorCategory: ErrorCategory.DATABASE,
    messageKey: 'error.database.DAT0006.connection_failed',
    severity: ErrorSeverity.ERROR,
    retryable: true,
    userFacing: false,
  },
  /** A database query failed for an unclassified reason */
  QUERY_FAILED: {
    code: 'DAT0007',
    message: 'Query failed',
    httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    errorType: ErrorType.DATABASE,
    errorCategory: ErrorCategory.DATABASE,
    messageKey: 'error.database.DAT0007.query_failed',
    severity: ErrorSeverity.ERROR,
    retryable: false,
    userFacing: false,
  },
  /** A database constraint other than unique/foreign-key was violated */
  CONSTRAINT_VIOLATION: {
    code: 'DAT0008',
    message: 'Constraint violation',
    httpStatus: HttpStatus.BAD_REQUEST,
    errorType: ErrorType.DATABASE,
    errorCategory: ErrorCategory.CLIENT,
    messageKey: 'error.database.DAT0008.constraint_violation',
    severity: ErrorSeverity.WARNING,
    retryable: false,
    userFacing: true,
  },
  /** The requested department does not exist within the caller's tenant */
  DEPARTMENT_NOT_FOUND: {
    code: 'DAT0009',
    message: 'Department not found',
    httpStatus: HttpStatus.NOT_FOUND,
    errorType: ErrorType.DATABASE,
    errorCategory: ErrorCategory.CLIENT,
    messageKey: 'error.database.DAT0009.department_not_found',
    severity: ErrorSeverity.WARNING,
    retryable: false,
    userFacing: true,
  },
  /** The requested company does not exist */
  COMPANY_NOT_FOUND: {
    code: 'DAT0010',
    message: 'Company not found',
    httpStatus: HttpStatus.NOT_FOUND,
    errorType: ErrorType.DATABASE,
    errorCategory: ErrorCategory.CLIENT,
    messageKey: 'error.database.DAT0010.company_not_found',
    severity: ErrorSeverity.WARNING,
    retryable: false,
    userFacing: true,
  },
} as const satisfies Record<string, ErrorCodeDefinition>;
