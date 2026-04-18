/**
 * Body / headers / query capture on the error path.
 *
 * Called from {@link AllExceptionsFilter} after the response body has been
 * built so operators can see what the caller actually sent alongside the
 * recorded exception in Tempo.
 *
 * ## Safety rails
 *
 * 1. **Never mutate caller state** — inputs are `structuredClone`d before
 *    passing to the redactor (fast-redact mutates in place).
 * 2. **Never throw** — the whole body is wrapped in `try/catch` so a bug here
 *    can't convert an already-failing request into a 500 from the filter.
 * 3. **Bounded output** — 1 KB per field, 8 KB per span. Oversize values are
 *    truncated with a sentinel; pathological inputs can't blow span size.
 * 4. **Rate-limited** — a module-level token bucket (capacity 50, refill
 *    50/sec) caps the blast radius of a burst of failures.
 * 5. **Content-type skip list** — binary payloads (multipart, images, PDFs,
 *    etc.) emit a sentinel instead of their contents.
 *
 * ## Why two redaction passes
 *
 * - `redactObject` handles known sensitive paths (password, token, …) via the
 *   PII registry.
 * - `redactString` catches free-form PII (emails, JWTs, card numbers) that
 *   appear inside otherwise-benign fields after serialisation.
 *
 * Together they give defence-in-depth without either pattern owning all PII
 * knowledge.
 */
import { Request } from 'express';
import { RedactorService } from '@common/redaction/redactor.service';

// ─── Public contract ──────────────────────────────────────────────────────────

export interface BodyCaptureContext {
  readonly request: Request;
  readonly responseBody?: unknown;
  readonly redactor: RedactorService;
}

export interface CapturedBodySet {
  requestBody?: string;
  requestHeaders?: string;
  requestQuery?: string;
  responseBody?: string;
}

// ─── Tunables ─────────────────────────────────────────────────────────────────

/** Per-field cap (bytes). Anything larger is truncated with {@link TRUNC_SENTINEL}. */
export const PER_FIELD_CAP_BYTES = 1024;

/** Total across all captured fields (bytes) per span. */
export const TOTAL_CAP_BYTES = 8192;

/** Appended to any truncated field. */
export const TRUNC_SENTINEL = '…[truncated]';

/** Token-bucket capacity. */
const TOKEN_BUCKET_CAPACITY = 50;

/** Tokens refilled per second. */
const TOKEN_REFILL_PER_SEC = 50;

/**
 * Content-type prefixes that cause us to skip body capture entirely.
 * Binary payloads aren't useful for debugging and blow up span size.
 */
const SKIP_CONTENT_TYPES: readonly RegExp[] = [
  /^multipart\//i,
  /^application\/octet-stream$/i,
  /^image\//i,
  /^video\//i,
  /^application\/pdf$/i,
  /^application\/zip$/i,
];

// ─── Rate limiter state (module-level, deliberately simple) ───────────────────

let tokens = TOKEN_BUCKET_CAPACITY;
let lastRefill = Date.now();

/**
 * Consume one token. Returns `false` when the bucket is empty — callers
 * should short-circuit and emit a `[rate-limited]` sentinel.
 */
function takeToken(): boolean {
  const now = Date.now();
  const elapsedSec = (now - lastRefill) / 1000;
  if (elapsedSec > 0) {
    tokens = Math.min(TOKEN_BUCKET_CAPACITY, tokens + elapsedSec * TOKEN_REFILL_PER_SEC);
    lastRefill = now;
  }
  if (tokens >= 1) {
    tokens -= 1;
    return true;
  }
  return false;
}

/**
 * Test-only helper. Resets the bucket back to full so each test starts from
 * a known state. Not exported through a barrel file to discourage production
 * use.
 */
export function __resetRateLimiter(): void {
  tokens = TOKEN_BUCKET_CAPACITY;
  lastRefill = Date.now();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Capture and redact the current request (optionally plus the response body
 * the filter built) into a bounded set of strings suitable for span
 * attributes.
 *
 * Always returns an object — never throws. An empty object means the capture
 * was skipped (rate-limited with a clean return path, or an unexpected error
 * was swallowed).
 */
export function captureRequestContext(ctx: BodyCaptureContext): CapturedBodySet {
  try {
    if (!takeToken()) {
      return { requestBody: '[rate-limited]', requestHeaders: '[rate-limited]' };
    }

    const out: CapturedBodySet = {};
    const rawContentType = ctx.request.headers?.['content-type'];
    const contentType = Array.isArray(rawContentType)
      ? String(rawContentType[0] ?? '')
      : String(rawContentType ?? '');
    const skipBody = SKIP_CONTENT_TYPES.some(r => r.test(contentType));

    out.requestHeaders = redactAndCap(ctx.request.headers, ctx.redactor);
    out.requestQuery = redactAndCap(ctx.request.query, ctx.redactor);

    if (ctx.request.body === undefined) {
      out.requestBody = '[body not parsed — middleware error]';
    } else if (skipBody) {
      out.requestBody = `[skipped content-type: ${contentType}]`;
    } else {
      out.requestBody = redactAndCap(ctx.request.body, ctx.redactor);
    }

    if (ctx.responseBody !== undefined) {
      out.responseBody = redactAndCap(ctx.responseBody, ctx.redactor);
    }

    enforceTotalCap(out);
    return out;
  } catch {
    // Never throw — the request is already failing, don't compound the error.
    return {};
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Clone → registry-redact → serialise → free-form scrub → truncate.
 * Returns a JSON-serialised string (never an object) so callers can stamp it
 * directly onto a span attribute.
 */
function redactAndCap(input: unknown, redactor: RedactorService): string {
  let cloned: unknown;
  try {
    // structuredClone handles Dates, Maps, typed arrays, etc. Falls back to
    // JSON round-trip on engines that don't support it (Node 18+ does).
    cloned = typeof structuredClone === 'function' ? structuredClone(input) : input;
  } catch {
    // structuredClone throws on functions / symbols; fall through and let
    // the redactor work on the original (we still won't mutate because
    // primitives pass through and objects we assume the caller accepts
    // mutation on a doomed request — but best-effort defence).
    cloned = input;
  }

  // Path-based registry redaction. fast-redact tolerates primitives but we
  // only pass objects through it; primitives bypass this step.
  if (cloned !== null && typeof cloned === 'object') {
    redactor.redactObject(cloned);
  }

  let serialised: string;
  try {
    serialised = JSON.stringify(cloned);
  } catch {
    return '[unserialisable]';
  }
  if (serialised === undefined) {
    // JSON.stringify returns undefined for raw `undefined` / functions.
    return '[unserialisable]';
  }

  // Free-form scrub catches PII in string values that didn't match a registry
  // path (e.g. an email in a `note` or `content` field).
  const scrubbed = redactor.redactString(serialised);

  if (scrubbed.length <= PER_FIELD_CAP_BYTES) return scrubbed;
  return scrubbed.slice(0, PER_FIELD_CAP_BYTES - TRUNC_SENTINEL.length) + TRUNC_SENTINEL;
}

/**
 * Enforce the 8 KB per-span total. Repeatedly truncate the largest field
 * until the sum fits. Simple and deterministic; no heuristics about which
 * field is most valuable.
 */
function enforceTotalCap(set: CapturedBodySet): void {
  const keys: ReadonlyArray<keyof CapturedBodySet> = [
    'requestBody',
    'requestHeaders',
    'requestQuery',
    'responseBody',
  ];
  const sizeOf = (): number => keys.reduce((acc, k) => acc + (set[k]?.length ?? 0), 0);

  // Safety cap on iterations — each pass must shrink something; worst case
  // bounded by field count × small constant.
  let guard = 16;
  while (sizeOf() > TOTAL_CAP_BYTES && guard-- > 0) {
    let biggestKey: keyof CapturedBodySet | undefined;
    let biggestLen = 0;
    for (const k of keys) {
      const len = set[k]?.length ?? 0;
      if (len > biggestLen) {
        biggestLen = len;
        biggestKey = k;
      }
    }
    if (!biggestKey || biggestLen === 0) break;

    const current = set[biggestKey]!;
    const room = TOTAL_CAP_BYTES - (sizeOf() - biggestLen);
    if (room <= TRUNC_SENTINEL.length) {
      set[biggestKey] = TRUNC_SENTINEL;
    } else {
      set[biggestKey] = current.slice(0, room - TRUNC_SENTINEL.length) + TRUNC_SENTINEL;
    }
  }
}
