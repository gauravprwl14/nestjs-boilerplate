import { CallHandler, ExecutionContext } from '@nestjs/common';
import { context, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  ReadableSpan,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { ATTR_HTTP_ROUTE, ATTR_URL_PATH } from '@opentelemetry/semantic-conventions';
import { of } from 'rxjs';

import { TraceEnrichmentInterceptor } from '@telemetry/interceptors/trace-enrichment.interceptor';

// ─── OTel in-memory fixture (one per worker) ─────────────────────────────
const contextManager = new AsyncLocalStorageContextManager();
contextManager.enable();
context.setGlobalContextManager(contextManager);

const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});
trace.setGlobalTracerProvider(provider);
const tracer = trace.getTracer('trace-enrichment-test');

/**
 * Starts a span, runs `fn` inside its active context, ends the span, and
 * returns the finished `ReadableSpan` so the test can assert updated name
 * and attributes.
 */
function runInSpan(fn: () => void, spanName = 'POST'): ReadableSpan {
  const span = tracer.startSpan(spanName);
  const ctx = trace.setSpan(context.active(), span);
  return context.with(ctx, () => {
    fn();
    span.end();
    const finished = exporter.getFinishedSpans();
    return finished[finished.length - 1];
  });
}

type RequestShape = Partial<{
  method: string;
  url: string;
  originalUrl: string;
  route: { path?: string };
}>;

function buildCtx(request: RequestShape, type: 'http' | 'rpc' = 'http'): ExecutionContext {
  return {
    getType: () => type,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

function buildNext(): CallHandler {
  return { handle: () => of('ok') };
}

describe('TraceEnrichmentInterceptor', () => {
  let interceptor: TraceEnrichmentInterceptor;

  beforeEach(() => {
    exporter.reset();
    interceptor = new TraceEnrichmentInterceptor();
  });

  it('sets http.route, url.path, and renames the span when route is resolved', () => {
    // --- ARRANGE --- simulate Nest router having matched `/api/v1/tweets/:id`
    const req: RequestShape = {
      method: 'POST',
      originalUrl: '/api/v1/tweets/abc-123',
      route: { path: '/api/v1/tweets/:id' },
    };
    const ctx = buildCtx(req);

    // --- ACT ---
    const span = runInSpan(() => {
      interceptor.intercept(ctx, buildNext()).subscribe();
    });

    // --- ASSERT ---
    expect(span.attributes[ATTR_HTTP_ROUTE]).toBe('/api/v1/tweets/:id');
    expect(span.attributes[ATTR_URL_PATH]).toBe('/api/v1/tweets/abc-123');
    expect(span.name).toBe('POST /api/v1/tweets/:id');
  });

  it('falls back to normalisePath(originalUrl) when req.route is missing', () => {
    // --- ARRANGE --- no route set (pre-router edge case); raw url carries a UUID
    const req: RequestShape = {
      method: 'GET',
      originalUrl: '/api/v1/tweets/550e8400-e29b-41d4-a716-446655440000?page=1',
    };
    const ctx = buildCtx(req);

    // --- ACT ---
    const span = runInSpan(() => {
      interceptor.intercept(ctx, buildNext()).subscribe();
    }, 'GET');

    // --- ASSERT --- query is stripped off for http.route; url.path also strips it
    // (`rawPath = originalUrl.split('?')[0]` — kept verbatim from the plan spec).
    expect(span.attributes[ATTR_HTTP_ROUTE]).toBe('/api/v1/tweets/:id');
    expect(span.attributes[ATTR_URL_PATH]).toBe(
      '/api/v1/tweets/550e8400-e29b-41d4-a716-446655440000',
    );
    expect(span.name).toBe('GET /api/v1/tweets/:id');
  });

  it('is a no-op when there is no active span', () => {
    // --- ARRANGE --- no span started; interceptor invoked in the "root" context.
    const req: RequestShape = {
      method: 'POST',
      originalUrl: '/api/v1/tweets',
      route: { path: '/api/v1/tweets' },
    };
    const ctx = buildCtx(req);

    // --- ACT --- must not throw
    const result = () => interceptor.intercept(ctx, buildNext()).subscribe();

    // --- ASSERT ---
    expect(result).not.toThrow();
  });

  it('never throws when internal logic encounters bad input', () => {
    // --- ARRANGE --- getRequest returns a thrower proxy so reading `method`
    // blows up from within the interceptor.
    const req = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'method') throw new Error('boom');
          return undefined;
        },
      },
    );
    const ctx = {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }),
    } as unknown as ExecutionContext;

    // --- ACT / ASSERT --- interceptor must swallow and still return the handle
    expect(() =>
      runInSpan(() => {
        interceptor.intercept(ctx, buildNext()).subscribe();
      }),
    ).not.toThrow();
  });

  it('skips enrichment for non-HTTP execution contexts', () => {
    // --- ARRANGE --- an RPC-typed context; interceptor should return immediately.
    const req: RequestShape = {
      method: 'POST',
      originalUrl: '/api/v1/tweets',
      route: { path: '/api/v1/tweets' },
    };
    const ctx = buildCtx(req, 'rpc');

    // --- ACT ---
    const span = runInSpan(() => {
      interceptor.intercept(ctx, buildNext()).subscribe();
    });

    // --- ASSERT --- no attributes set, name unchanged
    expect(span.attributes[ATTR_HTTP_ROUTE]).toBeUndefined();
    expect(span.attributes[ATTR_URL_PATH]).toBeUndefined();
    expect(span.name).toBe('POST');
  });

  it('uses the semconv ATTR_HTTP_ROUTE key (not the legacy http.target)', () => {
    // --- ARRANGE --- regression guard: deprecated `http.target` must NOT be set.
    const req: RequestShape = {
      method: 'GET',
      originalUrl: '/health',
      route: { path: '/health' },
    };
    const ctx = buildCtx(req);

    // --- ACT ---
    const span = runInSpan(() => {
      interceptor.intercept(ctx, buildNext()).subscribe();
    }, 'GET');

    // --- ASSERT ---
    expect(ATTR_HTTP_ROUTE).toBe('http.route');
    expect(span.attributes['http.route']).toBe('/health');
    expect(span.attributes['http.target']).toBeUndefined();
  });
});
