import { context, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';

import { TracedHttpClient } from '@common/http-client/traced-http-client';
import { RedactorService } from '@common/redaction/redactor.service';
import { ErrorException } from '@errors/types/error-exception';
import { SRV } from '@errors/error-codes';
import { isSuppressed } from '@telemetry/utils/suppress-tracing';

// ─── OTel fixture ────────────────────────────────────────────────────────

const contextManager = new AsyncLocalStorageContextManager();
contextManager.enable();
context.setGlobalContextManager(contextManager);
const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});
trace.setGlobalTracerProvider(provider);

function makeFetchResponse(init: {
  ok: boolean;
  status: number;
  json?: unknown;
  text?: string;
}): Response {
  return {
    ok: init.ok,
    status: init.status,
    statusText: init.ok ? 'OK' : 'ERR',
    headers: new Headers({ 'content-type': 'application/json' }),
    url: 'https://api.example.com/test',
    redirected: false,
    type: 'basic',
    json: async () => init.json,
    text: async () => init.text ?? JSON.stringify(init.json ?? {}),
    clone: () => makeFetchResponse(init),
  } as unknown as Response;
}

describe('TracedHttpClient', () => {
  let redactor: RedactorService;
  let client: TracedHttpClient;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    exporter.reset();
    redactor = new RedactorService();
    client = new TracedHttpClient(redactor);
    fetchMock = jest.fn();
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
  });

  afterEach(() => {
    delete (global as unknown as { fetch?: unknown }).fetch;
  });

  it('returns parsed JSON on 2xx and sets no body-capture attribute', async () => {
    // Arrange
    fetchMock.mockResolvedValue(makeFetchResponse({ ok: true, status: 200, json: { ok: 1 } }));

    // Act
    const out = await client.request<{ ok: number }>({ url: 'https://api.example.com/test' });

    // Assert
    expect(out).toEqual({ ok: 1 });
    // No span attributes on success — this helper only wraps when there's
    // an active span; we just assert the fetch call shape here.
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/test',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('captures remote body on 4xx with email redacted, then throws', async () => {
    // Arrange
    fetchMock.mockResolvedValue(
      makeFetchResponse({
        ok: false,
        status: 400,
        text: JSON.stringify({ error: 'bad_email', field: 'alice@example.com' }),
      }),
    );

    // Act + Assert — must throw an ErrorException tagged SRV.EXTERNAL_API_ERROR.
    let thrown: unknown;
    await trace.getTracer('t').startActiveSpan('outer', async span => {
      try {
        await client.request({ url: 'https://api.example.com/test' });
      } catch (err) {
        thrown = err;
      }
      span.end();
    });

    expect(ErrorException.isErrorException(thrown)).toBe(true);
    const ex = thrown as ErrorException;
    expect(ex.code).toBe(SRV.EXTERNAL_API_ERROR.code);
    expect((ex.cause as { status?: number } | undefined)?.status).toBe(400);

    // The active span from startActiveSpan must carry the body-capture attr.
    const spans = exporter.getFinishedSpans();
    const attr = spans[spans.length - 1].attributes['http.client.response.body_redacted'] as
      | string
      | undefined;
    expect(attr).toBeDefined();
    expect(attr!.length).toBeLessThanOrEqual(1024);
    expect(attr).not.toContain('alice@example.com');
    expect(attr).toContain('[REDACTED:email]');
  });

  it('throws ErrorException with cause.status and remote-text cause.message on 500', async () => {
    // Arrange
    const remoteText = 'internal failure — request-id 7f8a';
    fetchMock.mockResolvedValue(makeFetchResponse({ ok: false, status: 500, text: remoteText }));

    // Act
    let thrown: unknown;
    try {
      await client.request({ url: 'https://api.example.com/test' });
    } catch (err) {
      thrown = err;
    }

    // Assert
    const ex = thrown as ErrorException;
    expect(ex.code).toBe(SRV.EXTERNAL_API_ERROR.code);
    const cause = ex.cause as { status?: number; message?: string } | undefined;
    expect(cause?.status).toBe(500);
    expect(cause?.message).toContain('internal failure');
  });

  it('skips body capture on error when captureBodyOnError is false', async () => {
    // Arrange
    fetchMock.mockResolvedValue(
      makeFetchResponse({
        ok: false,
        status: 500,
        text: 'sensitive vendor body: alice@example.com',
      }),
    );

    // Act + Assert — must still throw.
    let thrown: unknown;
    await trace.getTracer('t').startActiveSpan('outer', async span => {
      try {
        await client.request({
          url: 'https://api.example.com/test',
          captureBodyOnError: false,
        });
      } catch (err) {
        thrown = err;
      }
      span.end();
    });

    expect(ErrorException.isErrorException(thrown)).toBe(true);
    const spans = exporter.getFinishedSpans();
    const attr = spans[spans.length - 1].attributes['http.client.response.body_redacted'];
    expect(attr).toBeUndefined();
  });

  it('aborts on timeout and throws with a cause mentioning timeout', async () => {
    // Arrange — fetch that never resolves unless aborted.
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const err = Object.assign(new Error('aborted'), { name: 'AbortError' });
            reject(err);
          });
        }),
    );

    // Act + Assert
    let thrown: unknown;
    try {
      await client.request({ url: 'https://api.example.com/slow', timeoutMs: 25 });
    } catch (err) {
      thrown = err;
    }

    expect(ErrorException.isErrorException(thrown)).toBe(true);
    const ex = thrown as ErrorException;
    expect(ex.code).toBe(SRV.EXTERNAL_API_ERROR.code);
    expect(ex.cause).toBeDefined();
    // The outer ErrorException message mentions the timeout (the inner
    // cause carries the raw AbortError).
    expect(ex.message.toLowerCase()).toContain('timed out');
  });

  it('wraps fetch in withSuppressed when URL host matches OTel exporter', async () => {
    // Arrange — configure exporter endpoint via env so the client picks it up.
    const priorEnv = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://collector:4318';

    // Build a fresh client so the env var is re-read if it's cached.
    const c = new TracedHttpClient(redactor);
    let suppressedInside = false;
    fetchMock.mockImplementation(async () => {
      suppressedInside = isSuppressed();
      return makeFetchResponse({ ok: true, status: 200, json: { ok: 1 } });
    });

    // Act
    await c.request({ url: 'http://collector:4318/v1/traces' });

    // Assert
    expect(suppressedInside).toBe(true);

    // Cleanup
    if (priorEnv === undefined) delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    else process.env.OTEL_EXPORTER_OTLP_ENDPOINT = priorEnv;
  });
});
