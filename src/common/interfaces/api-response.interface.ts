import { ErrorFieldDetail } from '@errors/interfaces/error.interfaces';

/**
 * Standard API success response wrapper.
 * All successful responses follow this shape.
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: ApiResponseMeta;
  /** Request correlation ID, echoed from the incoming request */
  requestId?: string;
  /** Distributed tracing ID */
  traceId?: string;
  timestamp: string;
}

/**
 * Standard API error response wrapper.
 * All error responses follow this shape.
 * Supports multiple errors (e.g. bulk validation failures).
 */
export interface ApiErrorResponse {
  success: false;
  /** Array of error details — most requests will contain a single entry */
  errors: ApiErrorDetail[];
  /** Request correlation ID, echoed from the incoming request */
  requestId?: string;
  /** Distributed tracing ID */
  traceId?: string;
  timestamp: string;
}

/** Single error detail included in error responses */
export interface ApiErrorDetail {
  /** Domain-prefixed error code (e.g. "VAL0001") */
  code: string;
  /** Human-readable error message */
  message: string;
  /** High-level error type classification */
  errorType?: string;
  /** Error category for metrics routing */
  errorCategory?: string;
  /** Per-field validation error details */
  details?: ErrorFieldDetail[];
}

/**
 * Response metadata for paginated results.
 * requestId and traceId are at the root ApiSuccessResponse level, not here.
 */
export interface ApiResponseMeta {
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
}

/**
 * @deprecated Use {@link ErrorFieldDetail} from '@errors/interfaces/error.interfaces' instead.
 * Kept for backwards compatibility — will be removed in the next major version.
 */
export type ApiErrorFieldDetail = ErrorFieldDetail;
