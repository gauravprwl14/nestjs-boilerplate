import { HttpStatus } from '@nestjs/common';
import { ErrorType, ErrorCategory, ErrorSeverity, ErrorCodeDefinition } from '../interfaces/error.interfaces';

/**
 * General / infrastructure error codes (GEN prefix).
 * These cover rate limiting, timeouts, and availability issues.
 */
export const GEN = {
  /** Rate limit exceeded — caller is sending too many requests */
  RATE_LIMITED: {
    code: 'GEN0001',
    message: 'Rate limit exceeded',
    httpStatus: HttpStatus.TOO_MANY_REQUESTS,
    errorType: ErrorType.INFRASTRUCTURE,
    errorCategory: ErrorCategory.CLIENT,
    messageKey: 'error.infrastructure.GEN0001.rate_limited',
    severity: ErrorSeverity.WARNING,
    retryable: true,
    userFacing: true,
  },
  /** Request took too long to complete */
  REQUEST_TIMEOUT: {
    code: 'GEN0002',
    message: 'Request timeout',
    httpStatus: HttpStatus.REQUEST_TIMEOUT,
    errorType: ErrorType.TIMEOUT,
    errorCategory: ErrorCategory.SERVER,
    messageKey: 'error.timeout.GEN0002.request_timeout',
    severity: ErrorSeverity.ERROR,
    retryable: true,
    userFacing: true,
  },
  /** Upstream service or the application itself is temporarily unavailable */
  SERVICE_UNAVAILABLE: {
    code: 'GEN0003',
    message: 'Service unavailable',
    httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
    errorType: ErrorType.INFRASTRUCTURE,
    errorCategory: ErrorCategory.SERVER,
    messageKey: 'error.infrastructure.GEN0003.service_unavailable',
    severity: ErrorSeverity.ERROR,
    retryable: true,
    userFacing: true,
  },
  /** An unexpected, unclassified error occurred */
  UNKNOWN_ERROR: {
    code: 'GEN0004',
    message: 'An unexpected error occurred',
    httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    errorType: ErrorType.INFRASTRUCTURE,
    errorCategory: ErrorCategory.SERVER,
    messageKey: 'error.infrastructure.GEN0004.unknown_error',
    severity: ErrorSeverity.ERROR,
    retryable: false,
    userFacing: false,
  },
} as const satisfies Record<string, ErrorCodeDefinition>;
