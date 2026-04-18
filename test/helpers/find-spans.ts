/**
 * Tiny assertion helpers for inspecting {@link ReadableSpan}s collected by
 * {@link InMemorySpanExporter}. The API is intentionally predicate-based so
 * tests stay readable even when the exact span name depends on which
 * instrumentation emitted it (e.g. `POST` vs `HTTP POST`).
 */
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { SpanStatusCode } from '@opentelemetry/api';

/**
 * Finds the first span whose name matches `pattern`. Returns `undefined`
 * when no span matches — assertions should use `expect(...).toBeDefined()`
 * to fail loudly rather than silently.
 */
export function findSpanByName(
  spans: readonly ReadableSpan[],
  pattern: string | RegExp,
): ReadableSpan | undefined {
  const test = (name: string): boolean =>
    typeof pattern === 'string' ? name === pattern : pattern.test(name);
  return spans.find(s => test(s.name));
}

/**
 * Returns every ancestor of `span` reachable via `parentSpanContext`.
 * The first element is the direct parent; the last is the root.
 * Cycles and self-parented spans are skipped defensively.
 */
export function findSpanAncestry(span: ReadableSpan, all: readonly ReadableSpan[]): ReadableSpan[] {
  const byId = new Map<string, ReadableSpan>();
  for (const s of all) byId.set(s.spanContext().spanId, s);
  const chain: ReadableSpan[] = [];
  const seen = new Set<string>();
  let current: ReadableSpan | undefined = span;
  while (current) {
    const parentId = current.parentSpanContext?.spanId;
    if (!parentId) break;
    if (seen.has(parentId)) break;
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    chain.push(parent);
    current = parent;
  }
  return chain;
}

/** Fails when the span does not carry an event whose name exactly matches. */
export function assertSpanHasEvent(span: ReadableSpan, eventName: string): void {
  const names = span.events.map(e => e.name);
  if (!names.includes(eventName)) {
    throw new Error(
      `Expected span "${span.name}" to emit event "${eventName}"; saw: [${names.join(', ')}]`,
    );
  }
}

/**
 * Walks every string-valued attribute on the span — both the span itself
 * and all of its events — and fails on the first occurrence of `needle`.
 * Used to prove PII strings never leak into the trace surface.
 */
export function assertSpanLacksSubstring(span: ReadableSpan, needle: string): void {
  const check = (where: string, source: Record<string, unknown> | undefined): void => {
    if (!source) return;
    for (const [key, raw] of Object.entries(source)) {
      const values = Array.isArray(raw) ? raw : [raw];
      for (const v of values) {
        if (typeof v === 'string' && v.includes(needle)) {
          throw new Error(
            `Span "${span.name}" leaked "${needle}" in ${where} attribute "${key}": ${v}`,
          );
        }
      }
    }
  };

  check('span', span.attributes as Record<string, unknown>);
  for (const ev of span.events) {
    check(`event<${ev.name}>`, ev.attributes as Record<string, unknown> | undefined);
  }
}

/** Human-readable name for the span's status code (UNSET|OK|ERROR). */
export function spanStatusName(span: ReadableSpan): 'UNSET' | 'OK' | 'ERROR' {
  switch (span.status.code) {
    case SpanStatusCode.OK:
      return 'OK';
    case SpanStatusCode.ERROR:
      return 'ERROR';
    default:
      return 'UNSET';
  }
}
