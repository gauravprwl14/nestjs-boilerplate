import { HttpStatus } from '@nestjs/common';
import { ErrorType, ErrorCategory, ErrorSeverity, ErrorCodeDefinition } from '../interfaces/error.interfaces';

/**
 * Server / infrastructure error codes (SRV prefix).
 * All errors relate to internal server failures, queues, and caching.
 */
export const SERVER_ERRORS = {
  /** Unexpected internal server error — message masked from end users */
  INTERNAL_ERROR: {
    code: 'SRV0001',
    message: 'Internal server error',
    httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    errorType: ErrorType.INFRASTRUCTURE,
    errorCategory: ErrorCategory.SERVER,
    messageKey: 'error.server.SRV0001.internal_error',
    severity: ErrorSeverity.ERROR,
    retryable: false,
    userFacing: false,
  },
  /** A background queue operation failed */
  QUEUE_ERROR: {
    code: 'SRV0002',
    message: 'Queue operation failed',
    httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    errorType: ErrorType.INFRASTRUCTURE,
    errorCategory: ErrorCategory.SERVER,
    messageKey: 'error.server.SRV0002.queue_error',
    severity: ErrorSeverity.ERROR,
    retryable: true,
    userFacing: false,
  },
  /** A cache read or write operation failed */
  CACHE_ERROR: {
    code: 'SRV0003',
    message: 'Cache operation failed',
    httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    errorType: ErrorType.INFRASTRUCTURE,
    errorCategory: ErrorCategory.SERVER,
    messageKey: 'error.server.SRV0003.cache_error',
    severity: ErrorSeverity.ERROR,
    retryable: true,
    userFacing: false,
  },
} as const satisfies Record<string, ErrorCodeDefinition>;
