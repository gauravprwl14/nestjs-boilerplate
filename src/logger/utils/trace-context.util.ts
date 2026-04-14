import { v4 as uuidV4 } from 'uuid';

/**
 * Extracted trace context from incoming request headers.
 */
export interface TraceContext {
  /** W3C trace ID (32 hex chars) or generated UUID. */
  traceId: string;
  /** W3C span ID (16 hex chars) or generated UUID. */
  spanId: string;
  /** Request correlation ID (from x-request-id or generated UUID). */
  requestId: string;
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Returns true if `value` is a valid lowercase hex string of exactly `length` characters.
 */
export function isValidHexId(value: string, length: number): boolean {
  if (!value || value.length !== length) return false;
  return /^[0-9a-f]+$/.test(value);
}

// ─── Header parsers ───────────────────────────────────────────────────────────

/**
 * Parses a W3C traceparent header.
 * Format: `00-{traceId:32hex}-{spanId:16hex}-{flags:2hex}`
 *
 * @returns `{ traceId, spanId }` or null if the header is invalid.
 */
export function parseW3CTraceParent(
  header: string,
): Pick<TraceContext, 'traceId' | 'spanId'> | null {
  const parts = header.trim().split('-');
  if (parts.length < 4) return null;

  const [, traceId, spanId] = parts;
  if (!isValidHexId(traceId, 32) || !isValidHexId(spanId, 16)) return null;

  return { traceId, spanId };
}

/**
 * Parses a B3 single-header propagation header.
 * Format: `{traceId}-{spanId}[-{flags}[-{parentSpanId}]]`
 * TraceId may be 32 or 16 hex chars.
 *
 * @returns `{ traceId, spanId }` or null if the header is invalid.
 */
export function parseB3SingleHeader(
  header: string,
): Pick<TraceContext, 'traceId' | 'spanId'> | null {
  const parts = header.trim().split('-');
  if (parts.length < 2) return null;

  const [traceId, spanId] = parts;
  const validTrace = isValidHexId(traceId, 32) || isValidHexId(traceId, 16);
  if (!validTrace || !isValidHexId(spanId, 16)) return null;

  // Normalize 64-bit traceId to 128-bit
  const normalizedTraceId = traceId.length === 16 ? traceId.padStart(32, '0') : traceId;
  return { traceId: normalizedTraceId, spanId };
}

/**
 * Parses B3 multi-header propagation.
 * Expects `X-B3-TraceId` and `X-B3-SpanId` headers.
 *
 * @param headers  Raw headers object (keys should be lower-cased).
 * @returns `{ traceId, spanId }` or null if headers are missing/invalid.
 */
export function parseB3MultiHeader(
  headers: Record<string, string | string[] | undefined>,
): Pick<TraceContext, 'traceId' | 'spanId'> | null {
  const traceId = extractHeader(headers, 'x-b3-traceid');
  const spanId = extractHeader(headers, 'x-b3-spanid');

  if (!traceId || !spanId) return null;

  const validTrace = isValidHexId(traceId, 32) || isValidHexId(traceId, 16);
  if (!validTrace || !isValidHexId(spanId, 16)) return null;

  const normalizedTraceId = traceId.length === 16 ? traceId.padStart(32, '0') : traceId;
  return { traceId: normalizedTraceId, spanId };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Safely extracts the first string value from a raw headers object for a given key.
 */
function extractHeader(
  headers: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = headers[key];
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

// ─── Main extractor ───────────────────────────────────────────────────────────

/**
 * Extracts a TraceContext from incoming request headers.
 *
 * Priority order:
 * 1. W3C `traceparent`
 * 2. B3 single header (`b3`)
 * 3. B3 multi-headers (`x-b3-traceid` + `x-b3-spanid`)
 * 4. Fallback: generate new UUID-based IDs
 *
 * `requestId` is always pulled from `x-request-id` first, then falls back to a new UUID.
 *
 * @param headers  Raw incoming request headers (keys should be lower-cased).
 * @returns        A fully populated TraceContext.
 */
export function extractTraceContext(
  headers: Record<string, string | string[] | undefined>,
): TraceContext {
  const requestId = extractHeader(headers, 'x-request-id') ?? uuidV4();

  // 1. W3C traceparent
  const traceparent = extractHeader(headers, 'traceparent');
  if (traceparent) {
    const parsed = parseW3CTraceParent(traceparent);
    if (parsed) {
      return { ...parsed, requestId };
    }
  }

  // 2. B3 single header
  const b3Single = extractHeader(headers, 'b3');
  if (b3Single) {
    const parsed = parseB3SingleHeader(b3Single);
    if (parsed) {
      return { ...parsed, requestId };
    }
  }

  // 3. B3 multi-header
  const b3Multi = parseB3MultiHeader(headers);
  if (b3Multi) {
    return { ...b3Multi, requestId };
  }

  // 4. Fallback
  return {
    traceId: uuidV4().replace(/-/g, ''),
    spanId: uuidV4().replace(/-/g, '').slice(0, 16),
    requestId,
  };
}
