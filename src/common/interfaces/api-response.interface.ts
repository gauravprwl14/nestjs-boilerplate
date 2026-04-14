/**
 * Standard API success response wrapper.
 * All successful responses follow this shape.
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: ApiResponseMeta;
  timestamp: string;
}

/**
 * Standard API error response wrapper.
 * All error responses follow this shape.
 */
export interface ApiErrorResponse {
  success: false;
  error: ApiErrorDetail;
  timestamp: string;
}

/** Error detail included in error responses */
export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: ApiErrorFieldDetail[];
  requestId?: string;
  traceId?: string;
}

/** Per-field validation error detail */
export interface ApiErrorFieldDetail {
  field: string;
  message: string;
}

/** Response metadata for paginated results */
export interface ApiResponseMeta {
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
  requestId?: string;
  traceId?: string;
}
