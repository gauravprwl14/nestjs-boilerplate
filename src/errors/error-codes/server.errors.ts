import { HttpStatus } from '@nestjs/common';
import {
  ErrorType,
  ErrorCategory,
  ErrorSeverity,
  ErrorCodeDefinition,
} from '../interfaces/error.interfaces';

/**
 * Server / infrastructure error codes (SRV prefix).
 * All errors relate to internal server failures, queues, and caching.
 */
export const SRV = {
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
  /**
   * An outbound call to an external API failed.
   * Mapped to 502 (Bad Gateway) since the remote peer — not this service —
   * is the authoritative source of the failure. `userFacing` is false so
   * the filter masks any vendor-specific detail from end users; the span /
   * log still carries the full cause chain for operators.
   */
  EXTERNAL_API_ERROR: {
    code: 'SRV0004',
    message: 'External API call failed.',
    httpStatus: HttpStatus.BAD_GATEWAY,
    errorType: ErrorType.INFRASTRUCTURE,
    errorCategory: ErrorCategory.SERVER,
    messageKey: 'error.server.SRV0004.external_api_error',
    severity: ErrorSeverity.ERROR,
    retryable: true,
    userFacing: false,
  },
} as const satisfies Record<string, ErrorCodeDefinition>;
