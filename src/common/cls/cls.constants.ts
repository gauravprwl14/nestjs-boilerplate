/**
 * CLS (Continuation Local Storage) keys for request-scoped context.
 * These values persist throughout the async call chain of a single request.
 */
export enum ClsKey {
  /** Unique request identifier */
  REQUEST_ID = 'requestId',
  /** Authenticated user ID (from x-user-id header) */
  USER_ID = 'userId',
  /** OpenTelemetry trace ID */
  TRACE_ID = 'traceId',
  /** OpenTelemetry span ID */
  SPAN_ID = 'spanId',
}
