/**
 * Opt-in HTTP client helper for outbound calls that need the remote
 * response body visible in Tempo on failure.
 *
 * ## When to use it
 *
 * The auto-instrumentation in `@opentelemetry/instrumentation-http` plus the
 * {@link src/telemetry/hooks/outbound-http.hooks.ts} overlay already give you:
 *
 * - `http.client.request.headers_redacted`
 * - `http.client.response.headers_redacted` (on 4xx/5xx)
 * - duration, status, peer info
 *
 * What they do NOT give you is the **remote response body** — that would
 * require teeing the response stream, which breaks downstream consumers.
 *
 * Use `TracedHttpClient` when the vendor's 4xx/5xx body carries the real
 * reason (Stripe `{error: invalid_signature}`, Salesforce fault strings, …)
 * and you need that visible in Tempo.
 *
 * ## Safety rails
 *
 * - The body is read as text (`resp.text()`) and capped to 1 KB.
 * - The body is redacted with {@link RedactorService.redactString} before
 *   being stamped on the span attribute.
 * - Non-2xx responses always throw `ErrorException(SRV.EXTERNAL_API_ERROR)`
 *   so the filter's error path runs.
 * - Calls to the OTel exporter host are wrapped in `withSuppressed` to break
 *   feedback loops.
 * - A timeout (`AbortController`) prevents hung calls from holding request
 *   contexts open.
 */
import { Injectable } from '@nestjs/common';
import { trace } from '@opentelemetry/api';

import { RedactorService } from '@common/redaction/redactor.service';
import { SRV } from '@errors/error-codes';
import { ErrorException } from '@errors/types/error-exception';
import { withSuppressed } from '@telemetry/utils/suppress-tracing';

// ─── Public contract ──────────────────────────────────────────────────────────

export interface TracedRequestOptions {
  /** Fully qualified URL. No base-URL handling here — keep it explicit. */
  readonly url: string;
  readonly method?: string;
  readonly headers?: Record<string, string>;
  readonly body?: string | ArrayBuffer | Uint8Array;
  readonly timeoutMs?: number;
  /**
   * When `true` (default) the client reads and redacts the remote body on
   * non-2xx and stamps `http.client.response.body_redacted` on the active
   * span. Set to `false` for calls where the remote body is sensitive and
   * you'd rather trade debuggability for minimum footprint.
   */
  readonly captureBodyOnError?: boolean;
}

// ─── Tunables ─────────────────────────────────────────────────────────────────

/** Default timeout (ms). */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Max bytes of remote body to read when capturing. */
const BODY_CAP_BYTES = 1024;

/** Max bytes of remote body to stash into the `cause` message (larger than
 * the redacted span attr so operators see more context in logs — it flows
 * through the ErrorException cause chain, which is logged once at the error
 * boundary, not stamped on a span). */
const CAUSE_MESSAGE_BYTES = 500;

// ─── Helper ───────────────────────────────────────────────────────────────────

@Injectable()
export class TracedHttpClient {
  constructor(private readonly redactor: RedactorService) {}

  /**
   * Execute an HTTP request with tracing-aware helpers.
   *
   * @throws {ErrorException} `SRV.EXTERNAL_API_ERROR` on non-2xx, timeout,
   * or network failure. The `cause` carries the remote status / raw text.
   */
  async request<T = unknown>(opts: TracedRequestOptions): Promise<T> {
    const method = opts.method ?? 'GET';
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const captureBody = opts.captureBodyOnError !== false;

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);

    const fetchInit: RequestInit = {
      method,
      headers: opts.headers,
      body: opts.body as BodyInit | undefined,
      signal: ac.signal,
    };

    const doFetch = (): Promise<Response> => fetch(opts.url, fetchInit);
    const suppressed = shouldSuppress(opts.url);

    let resp: Response;
    try {
      resp = suppressed ? await withSuppressed(doFetch) : await doFetch();
    } catch (err) {
      clearTimeout(timer);
      // Distinguish abort (timeout) from other network errors. The
      // ErrorException carries the raw cause so logs / cause-chain rendering
      // preserve the remote diagnostic.
      const isAbort = isAbortError(err);
      throw new ErrorException(SRV.EXTERNAL_API_ERROR, {
        message: isAbort
          ? `External API call timed out after ${timeoutMs}ms`
          : 'External API call failed (network error)',
        cause: err instanceof Error ? err : new Error(String(err)),
      });
    } finally {
      clearTimeout(timer);
    }

    if (resp.ok) {
      // Fast path: parse and return.
      const contentType = resp.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        return (await resp.json()) as T;
      }
      return (await resp.text()) as unknown as T;
    }

    // Non-2xx — capture body (if opted in), stamp span attr, throw.
    let rawText = '';
    try {
      rawText = await resp.text();
    } catch {
      /* some fetch implementations fail on .text() — tolerate */
    }

    if (captureBody && rawText.length > 0) {
      const redacted = this.redactor.redactString(rawText).slice(0, BODY_CAP_BYTES);
      const span = trace.getActiveSpan();
      if (span) span.setAttribute('http.client.response.body_redacted', redacted);
    }

    const causeMessage = rawText.slice(0, CAUSE_MESSAGE_BYTES);
    const cause = Object.assign(new Error(causeMessage || `HTTP ${resp.status}`), {
      status: resp.status,
    });
    throw new ErrorException(SRV.EXTERNAL_API_ERROR, {
      message: `External API returned ${resp.status}`,
      cause,
    });
  }
}

// ─── Internals ────────────────────────────────────────────────────────────────

/**
 * True when the destination URL targets the configured OTel exporter host.
 * Reads the endpoint from `OTEL_EXPORTER_OTLP_ENDPOINT` at call time so
 * tests and bootstrap can both drive it.
 */
function shouldSuppress(targetUrl: string): boolean {
  const exporterUrl = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!exporterUrl) return false;
  try {
    const exporterHost = new URL(normaliseUrl(exporterUrl)).hostname;
    const targetHost = new URL(normaliseUrl(targetUrl)).hostname;
    return exporterHost === targetHost;
  } catch {
    return false;
  }
}

function normaliseUrl(raw: string): string {
  if (raw.includes('://')) return raw.replace(/^grpc:\/\//, 'http://');
  return `http://${raw}`;
}

function isAbortError(err: unknown): boolean {
  if (err instanceof Error) {
    return err.name === 'AbortError' || /abort/i.test(err.message);
  }
  return false;
}
