/**
 * Hooks that plug into `@opentelemetry/instrumentation-http` to add debug
 * context to outbound HTTP client spans.
 *
 * The hooks intentionally do NOT capture outbound response BODIES — bodies
 * require a stream tee and risk breaking downstream consumers. Callers who
 * need the remote body on error should use
 * `src/common/http-client/traced-http-client.ts` (WP2-8), which reads the
 * body itself in a controlled way.
 *
 * ## Safety rails
 *
 * 1. Every hook catches internal errors — a buggy hook must never 500 the
 *    outbound request.
 * 2. Request and response header redaction uses an allowlist so unknown
 *    headers default to `[REDACTED]` (fail-closed).
 * 3. Outbound traffic to the OTel exporter itself is ignored entirely
 *    (no spans, no header capture) to prevent feedback loops.
 * 4. Callers inside a `withSuppressed(…)` scope are also ignored.
 */
import type { ClientRequest, IncomingMessage } from 'http';
import type { HttpInstrumentationConfig } from '@opentelemetry/instrumentation-http';

import { RedactorService } from '@common/redaction/redactor.service';
import { isSuppressed } from '@telemetry/utils/suppress-tracing';

// ─── Allowlist ────────────────────────────────────────────────────────────────

/**
 * Headers preserved as-is on outbound spans. Everything else becomes
 * `[REDACTED]`. Lowercase for case-insensitive lookup.
 */
const OUTBOUND_HEADER_ALLOWLIST: ReadonlySet<string> = new Set([
  'content-type',
  'content-length',
  'user-agent',
  'host',
  'accept',
  'accept-encoding',
  'x-correlation-id',
  'x-request-id',
  'x-rate-limit-remaining',
  'x-rate-limit-reset',
  'retry-after',
  'www-authenticate',
]);

/** Hard cap — header JSON above this is truncated (bytes). */
const HEADERS_CAP_BYTES = 1024;

// ─── Public builder ───────────────────────────────────────────────────────────

export interface BuildOutboundHooksOpts {
  readonly redactor: RedactorService;
  /**
   * OTel collector endpoint. Outbound requests to this host are ignored
   * entirely so we never loop telemetry back onto itself. The hook
   * extracts the hostname from the URL, so either `http://host:4318` or
   * `grpc://host:4317` is fine.
   */
  readonly exporterUrl?: string;
}

/**
 * Build the `HttpInstrumentationConfig` overlay — merge this into the
 * existing `@opentelemetry/instrumentation-http` options.
 */
export function buildOutboundHooks(
  opts: BuildOutboundHooksOpts,
): Partial<HttpInstrumentationConfig> {
  const exporterHost = parseHost(opts.exporterUrl);

  return {
    ignoreOutgoingRequestHook: (reqOpts): boolean => {
      try {
        if (isSuppressed()) return true;
        const hostname = (reqOpts as { hostname?: string }).hostname;
        if (exporterHost && hostname === exporterHost) return true;
        return false;
      } catch {
        return false;
      }
    },
    requestHook: (span, request): void => {
      try {
        if (isSuppressed()) return;
        if (!isClientRequest(request)) return;
        const json = redactHeadersAllowlist(request, opts.redactor);
        span.setAttribute('http.client.request.headers_redacted', json);
      } catch {
        /* never throw */
      }
    },
    responseHook: (span, response): void => {
      try {
        if (isSuppressed()) return;
        if (!isIncomingMessage(response)) return;
        const statusCode = response.statusCode ?? 0;
        // Fast-path: only capture headers on failure. Successful responses
        // dominate volume and don't need the debug context.
        if (statusCode < 400) return;
        const json = redactResponseHeaders(response, opts.redactor);
        span.setAttribute('http.client.response.headers_redacted', json);
      } catch {
        /* never throw */
      }
    },
  };
}

// ─── Internals ────────────────────────────────────────────────────────────────

function parseHost(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    // URL requires a scheme; grpc:// isn't standard so normalise to http://
    // purely for parsing.
    const normalised = url.includes('://') ? url.replace(/^grpc:\/\//, 'http://') : `http://${url}`;
    return new URL(normalised).hostname;
  } catch {
    return undefined;
  }
}

function isClientRequest(value: unknown): value is ClientRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { getHeaderNames?: unknown }).getHeaderNames === 'function'
  );
}

function isIncomingMessage(value: unknown): value is IncomingMessage {
  return (
    typeof value === 'object' && value !== null && 'headers' in (value as Record<string, unknown>)
  );
}

function redactHeadersAllowlist(req: ClientRequest, redactor: RedactorService): string {
  const headers: Record<string, string> = {};
  for (const name of req.getHeaderNames()) {
    const key = name.toLowerCase();
    headers[key] = OUTBOUND_HEADER_ALLOWLIST.has(key) ? String(req.getHeader(name)) : '[REDACTED]';
  }
  return capped(redactor.redactString(JSON.stringify(headers)));
}

function redactResponseHeaders(res: IncomingMessage, redactor: RedactorService): string {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(res.headers ?? {})) {
    const key = name.toLowerCase();
    const flat = Array.isArray(value) ? value.join(', ') : String(value ?? '');
    headers[key] = OUTBOUND_HEADER_ALLOWLIST.has(key) ? flat : '[REDACTED]';
  }
  return capped(redactor.redactString(JSON.stringify(headers)));
}

function capped(s: string): string {
  if (s.length <= HEADERS_CAP_BYTES) return s;
  return `${s.slice(0, HEADERS_CAP_BYTES - 3)}...`;
}
