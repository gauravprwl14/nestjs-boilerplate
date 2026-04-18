/**
 * Context key helper used to disable OTel instrumentation hooks inside a
 * bounded callback.
 *
 * ## Why it exists
 *
 * The outbound HTTP hooks in `src/telemetry/hooks/outbound-http.hooks.ts`
 * record headers and (optionally) bodies on outbound spans. When
 * `TracedHttpClient` talks to the OTel collector itself, we must NOT record
 * more telemetry for that call — otherwise the collector's error response
 * would trigger another outbound call, etc. Wrapping the collector-bound
 * fetch in `withSuppressed(() => fetch(...))` flips this flag; the hooks
 * read `isSuppressed()` and bail.
 *
 * ## Contract
 *
 * The key lives on the standard OTel context, which is propagated by
 * `AsyncLocalStorageContextManager`. Suppression therefore persists across
 * awaits, nested calls, and even handler boundaries inside the callback.
 */
import { context, createContextKey } from '@opentelemetry/api';

/** Symbol-based context key. Shared by hooks and helpers. */
export const SUPPRESS_TRACING_KEY = createContextKey('suppress-tracing');

/**
 * Returns `true` when the caller is inside a {@link withSuppressed} scope.
 * Never throws — a missing/invalid context manager is treated as "not
 * suppressed".
 */
export function isSuppressed(): boolean {
  try {
    return context.active().getValue(SUPPRESS_TRACING_KEY) === true;
  } catch {
    return false;
  }
}

/**
 * Run `fn` with tracing suppressed. The suppression is scoped to the
 * callback's synchronous body AND any awaits made from it (async-local
 * storage carries the context through microtasks).
 *
 * @example
 *   await withSuppressed(() => fetch(collectorUrl, ...));
 */
export function withSuppressed<T>(fn: () => T): T {
  const suppressedCtx = context.active().setValue(SUPPRESS_TRACING_KEY, true);
  return context.with(suppressedCtx, fn);
}
