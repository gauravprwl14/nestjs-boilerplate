import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  ReadableSpan,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { AllExceptionsFilter } from '@common/filters/all-exceptions.filter';
import { ErrorException } from '@errors/types/error-exception';
import { AUT, DAT, SRV, VAL } from '@errors/error-codes';
import { LogLevel } from '@logger/logger.interfaces';
import { RedactorService } from '@common/redaction/redactor.service';
import { createMockLogger, createMockConfig } from '../../../helpers';

type MockResponse = {
  status: jest.Mock;
  json: jest.Mock;
  statusCode?: number;
};

const buildHost = (
  request: Record<string, unknown> = {},
  response: Partial<MockResponse> = {},
): { host: ArgumentsHost; response: MockResponse } => {
  const res: MockResponse = {
    status: jest.fn().mockImplementation(function (this: MockResponse, code: number) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn().mockReturnThis(),
    ...response,
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'GET', url: '/api/v1/x', id: 'req-123', ...request }),
      getResponse: () => res,
    }),
  } as unknown as ArgumentsHost;
  return { host, response: res };
};

// ─── OTel fixture for span-recording assertions ──────────────────────────
// Each jest worker gets its own heap. We deliberately skip `trace.disable()`
// and `context.disable()` in afterAll — the worker exits cleanly after the
// suite finishes, and those destructive global resets have caused intermittent
// native-level jest-worker crashes (SIGSEGV) when multiple OTel-heavy specs
// run in parallel workers (ts-jest + native deps under memory pressure).
const contextManager = new AsyncLocalStorageContextManager();
contextManager.enable();
context.setGlobalContextManager(contextManager);

const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});
trace.setGlobalTracerProvider(provider);
const tracer = trace.getTracer('all-exceptions-filter-test');

/**
 * Runs `fn` inside an active span and returns the finished ReadableSpan so
 * tests can inspect events/attributes/status exactly once the filter has
 * done its work.
 */
function runInSpan(fn: () => void): ReadableSpan {
  const span = tracer.startSpan('http.server.test');
  const ctx = trace.setSpan(context.active(), span);
  return context.with(ctx, () => {
    fn();
    span.end();
    const finished = exporter.getFinishedSpans();
    return finished[finished.length - 1];
  });
}

describe('AllExceptionsFilter', () => {
  let logger: ReturnType<typeof createMockLogger>;
  let config: ReturnType<typeof createMockConfig>;
  let redactor: RedactorService;
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    exporter.reset();
    logger = createMockLogger();
    config = createMockConfig();
    redactor = new RedactorService();
    filter = new AllExceptionsFilter(logger as any, config as any, redactor);
  });

  describe('ErrorException pass-through', () => {
    it('sends the toResponse body with the statusCode and logs a 4xx as WARN', () => {
      // --- ARRANGE ---
      const err = new ErrorException(VAL.INVALID_INPUT, { message: 'bad email' });
      const { host, response } = buildHost();

      // --- ACT ---
      filter.catch(err, host);

      // --- ASSERT ---
      expect(response.status).toHaveBeenCalledWith(400);
      expect(response.json).toHaveBeenCalledTimes(1);
      const body = response.json.mock.calls[0][0];
      expect(body.success).toBe(false);
      expect(body.errors[0].code).toBe('VAL0001');
      expect(body.errors[0].message).toBe('bad email');
      expect(body.requestId).toBe('req-123');

      expect(logger.log).toHaveBeenCalledWith(
        'http.error',
        expect.objectContaining({ level: LogLevel.WARN }),
      );
      expect(logger.logError).not.toHaveBeenCalled();
    });

    it('logs 5xx errors via logError at ERROR severity', () => {
      // --- ARRANGE ---
      const err = new ErrorException(SRV.INTERNAL_ERROR);
      const { host, response } = buildHost();

      // --- ACT ---
      filter.catch(err, host);

      // --- ASSERT ---
      expect(response.status).toHaveBeenCalledWith(500);
      expect(logger.logError).toHaveBeenCalledWith(
        'http.error',
        err,
        expect.objectContaining({
          attributes: expect.objectContaining({ 'http.status': 500 }),
        }),
      );
      expect(logger.log).not.toHaveBeenCalled();
    });

    it('includes the cause chain only when not in production', () => {
      // --- ARRANGE ---
      const cause = new Error('driver failed');
      const err = new ErrorException(SRV.INTERNAL_ERROR, { cause });
      const { host, response } = buildHost();

      // --- ACT ---
      filter.catch(err, host);

      // --- ASSERT ---
      const body = response.json.mock.calls[0][0];
      expect(body.errors[0].cause).toBeDefined();
      expect(body.errors[0].cause[0].message).toBe('driver failed');
    });

    it('omits the cause chain in production', () => {
      // --- ARRANGE ---
      config.isProduction = true;
      const cause = new Error('driver failed');
      const err = new ErrorException(SRV.INTERNAL_ERROR, { cause });
      const { host, response } = buildHost();

      // --- ACT ---
      filter.catch(err, host);

      // --- ASSERT ---
      const body = response.json.mock.calls[0][0];
      expect(body.errors[0].cause).toBeUndefined();
    });
  });

  describe('HttpException fallback', () => {
    it('maps 404 HttpException to DAT.NOT_FOUND', () => {
      // --- ARRANGE ---
      const err = new HttpException('missing', HttpStatus.NOT_FOUND);
      const { host, response } = buildHost();

      // --- ACT ---
      filter.catch(err, host);

      // --- ASSERT ---
      expect(response.status).toHaveBeenCalledWith(404);
      const body = response.json.mock.calls[0][0];
      expect(body.errors[0].code).toBe(DAT.NOT_FOUND.code);
      expect(body.errors[0].message).toBe('missing');
    });

    it('flattens array messages from class-validator style responses', () => {
      // --- ARRANGE ---
      const err = new HttpException(
        { message: ['field a required', 'field b invalid'] },
        HttpStatus.BAD_REQUEST,
      );
      const { host, response } = buildHost();

      // --- ACT ---
      filter.catch(err, host);

      // --- ASSERT ---
      const body = response.json.mock.calls[0][0];
      expect(body.errors[0].message).toBe('field a required, field b invalid');
    });

    it('falls back to SRV.INTERNAL_ERROR for unmapped HTTP statuses', () => {
      // --- ARRANGE ---
      const err = new HttpException('teapot', 418);
      const { host, response } = buildHost();

      // --- ACT ---
      filter.catch(err, host);

      // --- ASSERT ---
      const body = response.json.mock.calls[0][0];
      expect(body.errors[0].code).toBe(SRV.INTERNAL_ERROR.code);
    });

    it('maps 401 HttpException to AUT.UNAUTHENTICATED', () => {
      // --- ARRANGE ---
      const err = new HttpException('no token', HttpStatus.UNAUTHORIZED);
      const { host, response } = buildHost();

      // --- ACT ---
      filter.catch(err, host);

      // --- ASSERT ---
      const body = response.json.mock.calls[0][0];
      expect(body.errors[0].code).toBe(AUT.UNAUTHENTICATED.code);
    });
  });

  describe('unknown exceptions', () => {
    it('wraps a plain Error into SRV.INTERNAL_ERROR', () => {
      // --- ARRANGE ---
      const err = new Error('kaboom');
      const { host, response } = buildHost();

      // --- ACT ---
      filter.catch(err, host);

      // --- ASSERT ---
      expect(response.status).toHaveBeenCalledWith(500);
      const body = response.json.mock.calls[0][0];
      expect(body.errors[0].code).toBe(SRV.INTERNAL_ERROR.code);
    });

    it('wraps a thrown non-Error value without crashing', () => {
      // --- ARRANGE ---
      const { host, response } = buildHost();

      // --- ACT ---
      filter.catch('weird', host);

      // --- ASSERT ---
      expect(response.status).toHaveBeenCalledWith(500);
      expect(response.json).toHaveBeenCalled();
    });
  });

  describe('response envelope', () => {
    it('includes timestamp and leaves requestId undefined when none is present', () => {
      // --- ARRANGE ---
      const err = new ErrorException(VAL.INVALID_INPUT);
      const { host, response } = buildHost({ id: undefined });

      // --- ACT ---
      filter.catch(err, host);

      // --- ASSERT ---
      const body = response.json.mock.calls[0][0];
      expect(typeof body.timestamp).toBe('string');
      expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
      expect(body.requestId).toBeUndefined();
    });
  });

  describe('span exception recording (single-owner rule)', () => {
    it('records exception exactly once on active span with cause chain', () => {
      // --- ARRANGE --- Prisma-like P2002 wrapped in an ErrorException
      const prismaCause = Object.assign(new Error('Unique constraint violated'), {
        code: 'P2002',
      });
      const err = new ErrorException(DAT.CONFLICT, {
        message: 'Tweet already exists',
        cause: prismaCause,
      });
      const { host } = buildHost();

      // --- ACT ---
      const span = runInSpan(() => filter.catch(err, host));

      // --- ASSERT --- exactly one `exception` event + one `exception.cause.1`
      const eventNames = span.events.map(e => e.name);
      expect(eventNames.filter(n => n === 'exception')).toHaveLength(1);
      expect(eventNames.filter(n => n === 'exception.cause.1')).toHaveLength(1);
    });

    it('sets span status to ERROR for 5xx errors with error.class 5xx', () => {
      // --- ARRANGE ---
      const err = new ErrorException(SRV.INTERNAL_ERROR);
      const { host } = buildHost();

      // --- ACT ---
      const span = runInSpan(() => filter.catch(err, host));

      // --- ASSERT ---
      expect(span.status.code).toBe(SpanStatusCode.ERROR);
      expect(span.attributes['error']).toBe(true);
      expect(span.attributes['error.class']).toBe('5xx');
    });

    it('marks span status ERROR for 4xx authentication errors (Tempo highlight)', () => {
      // --- ARRANGE --- 401; the filter now flags every captured error as
      // ERROR so Tempo's error filter surfaces failed-auth requests instead
      // of hiding them behind green (UNSET) rows. `error.class` keeps the
      // 4xx-vs-5xx distinction for dashboards.
      const err = new ErrorException(AUT.UNAUTHENTICATED);
      const { host } = buildHost();

      // --- ACT ---
      const span = runInSpan(() => filter.catch(err, host));

      // --- ASSERT ---
      expect(span.status.code).toBe(SpanStatusCode.ERROR);
      expect(span.attributes['error']).toBe(true);
      expect(span.attributes['error.class']).toBe('4xx');
    });

    it('marks span status ERROR for 4xx validation errors with error.class 4xx', () => {
      // --- ARRANGE --- 400
      const err = new ErrorException(VAL.INVALID_INPUT, { message: 'bad email' });
      const { host } = buildHost();

      // --- ACT ---
      const span = runInSpan(() => filter.catch(err, host));

      // --- ASSERT ---
      expect(span.status.code).toBe(SpanStatusCode.ERROR);
      expect(span.attributes['error']).toBe(true);
      expect(span.attributes['error.class']).toBe('4xx');
    });

    it('redacts PII from exception.message and exception.stacktrace on the span', () => {
      // --- ARRANGE ---
      const rawErr = new Error('user a@x.com not found');
      const { host } = buildHost();

      // --- ACT ---
      const span = runInSpan(() => filter.catch(rawErr, host));

      // --- ASSERT --- the exception event must not contain the raw email
      const exceptionEvent = span.events.find(e => e.name === 'exception');
      expect(exceptionEvent).toBeDefined();
      const msg = exceptionEvent!.attributes?.['exception.message'] as string | undefined;
      const stack = exceptionEvent!.attributes?.['exception.stacktrace'] as string | undefined;
      expect(msg).toBeDefined();
      expect(msg).not.toContain('a@x.com');
      if (stack && stack.length > 0) {
        expect(stack).not.toContain('a@x.com');
      }
    });

    it('sets http.status_code, http.method, http.route attributes on the span', () => {
      // --- ARRANGE ---
      const err = new ErrorException(DAT.NOT_FOUND, { message: 'missing' });
      const { host } = buildHost({
        method: 'POST',
        url: '/api/v1/tweets/abc',
        route: { path: '/api/v1/tweets/:id' },
      });

      // --- ACT ---
      const span = runInSpan(() => filter.catch(err, host));

      // --- ASSERT ---
      expect(span.attributes['http.status_code']).toBe(404);
      expect(span.attributes['http.method']).toBe('POST');
      expect(span.attributes['http.route']).toBe('/api/v1/tweets/:id');
    });

    it('writes the stable semconv HTTP attributes alongside the legacy keys', () => {
      // --- ARRANGE --- both stable and legacy keys must coexist so
      // semconv-aware dashboards and pre-existing ones both resolve.
      const err = new ErrorException(DAT.NOT_FOUND);
      const { host } = buildHost({
        method: 'PATCH',
        url: '/api/v1/tweets/abc',
        route: { path: '/api/v1/tweets/:id' },
      });

      // --- ACT ---
      const span = runInSpan(() => filter.catch(err, host));

      // --- ASSERT --- stable semconv keys
      expect(span.attributes['http.request.method']).toBe('PATCH');
      expect(span.attributes['http.response.status_code']).toBe(404);
      // legacy keys (back-compat)
      expect(span.attributes['http.method']).toBe('PATCH');
      expect(span.attributes['http.status_code']).toBe(404);
    });

    it('sets error.code, error.user_facing, error.retryable from the ErrorException definition', () => {
      // --- ARRANGE --- the exception recorder sets these too; the filter
      // writes them explicitly so the contract is visible in-file.
      const err = new ErrorException(AUT.UNAUTHENTICATED);
      const { host } = buildHost({ method: 'GET', url: '/api/v1/anything' });

      // --- ACT ---
      const span = runInSpan(() => filter.catch(err, host));

      // --- ASSERT ---
      expect(span.attributes['error.code']).toBe(AUT.UNAUTHENTICATED.code);
      expect(span.attributes['error.user_facing']).toBe(AUT.UNAUTHENTICATED.userFacing);
      expect(span.attributes['error.retryable']).toBe(AUT.UNAUTHENTICATED.retryable);
    });

    it('stamps request.id on the span when RequestIdMiddleware populated req.id', () => {
      // --- ARRANGE ---
      const err = new ErrorException(VAL.INVALID_INPUT);
      const { host } = buildHost({
        method: 'POST',
        url: '/api/v1/tweets',
        id: 'req_abc_123',
      });

      // --- ACT ---
      const span = runInSpan(() => filter.catch(err, host));

      // --- ASSERT ---
      expect(span.attributes['request.id']).toBe('req_abc_123');
    });

    it('omits request.id from span attributes when req.id is absent', () => {
      // --- ARRANGE --- some error paths hit before RequestIdMiddleware
      // populates req.id (e.g., OTel-level 404s). We must not stamp an
      // empty string — Tempo's attribute-search doesn't handle empties well.
      const err = new ErrorException(DAT.NOT_FOUND);
      const { host } = buildHost({ method: 'GET', url: '/api/v1/missing', id: '' });

      // --- ACT ---
      const span = runInSpan(() => filter.catch(err, host));

      // --- ASSERT ---
      expect(span.attributes['request.id']).toBeUndefined();
    });

    it('falls back to normalised request.url when request.route.path is absent', () => {
      // --- ARRANGE ---
      const err = new ErrorException(VAL.INVALID_INPUT);
      const { host } = buildHost({ method: 'GET', url: '/api/v1/raw', route: undefined });

      // --- ACT ---
      const span = runInSpan(() => filter.catch(err, host));

      // --- ASSERT --- pure slug path, no ids, so normalisePath is a no-op
      expect(span.attributes['http.route']).toBe('/api/v1/raw');
    });

    it('uses normalisePath to collapse id-bearing urls on the fallback path', () => {
      // --- ARRANGE --- middleware error before router resolves the route;
      // the raw URL carries a UUID that would blow up Tempo's cardinality
      // if written as-is.
      const err = new ErrorException(AUT.UNAUTHENTICATED);
      const { host } = buildHost({
        method: 'GET',
        url: '/api/v1/tweets/550e8400-e29b-41d4-a716-446655440000',
        route: undefined,
      });

      // --- ACT ---
      const span = runInSpan(() => filter.catch(err, host));

      // --- ASSERT ---
      expect(span.attributes['http.route']).toBe('/api/v1/tweets/:id');
    });

    it('strips query strings from the normalised fallback route', () => {
      // --- ARRANGE ---
      const err = new ErrorException(VAL.INVALID_INPUT);
      const { host } = buildHost({
        method: 'GET',
        url: '/api/v1/x?page=1',
        originalUrl: '/api/v1/x?page=1',
        route: undefined,
      });

      // --- ACT ---
      const span = runInSpan(() => filter.catch(err, host));

      // --- ASSERT ---
      expect(span.attributes['http.route']).toBe('/api/v1/x');
    });

    it('still uses req.route.path when the router has resolved a pattern', () => {
      // --- ARRANGE --- regression guard: the happy path must not be affected
      // by the normalisePath fallback.
      const err = new ErrorException(DAT.NOT_FOUND);
      const { host } = buildHost({
        method: 'DELETE',
        url: '/api/v1/tweets/abc-123',
        route: { path: '/api/v1/tweets/:id' },
      });

      // --- ACT ---
      const span = runInSpan(() => filter.catch(err, host));

      // --- ASSERT ---
      expect(span.attributes['http.route']).toBe('/api/v1/tweets/:id');
    });

    it('still returns the pre-refactor response body shape', () => {
      // --- ARRANGE ---
      const err = new ErrorException(VAL.INVALID_INPUT, { message: 'bad email' });
      const { host, response } = buildHost();

      // --- ACT ---
      runInSpan(() => filter.catch(err, host));

      // --- ASSERT ---
      const body = response.json.mock.calls[0][0];
      expect(body).toMatchObject({
        success: false,
        requestId: 'req-123',
        errors: [
          expect.objectContaining({
            code: VAL.INVALID_INPUT.code,
            message: 'bad email',
          }),
        ],
      });
      expect(typeof body.timestamp).toBe('string');
    });

    it('captures http.request.body_redacted on 500 with password redacted', () => {
      // --- ARRANGE --- 5xx request carrying a nested password that must be
      // masked before appearing on the span attribute.
      const err = new ErrorException(SRV.INTERNAL_ERROR);
      const { host } = buildHost({
        method: 'POST',
        url: '/api/v1/users',
        body: { name: 'Alice', credentials: { password: 'hunter2' } },
      });

      // --- ACT ---
      const span = runInSpan(() => filter.catch(err, host));

      // --- ASSERT ---
      const captured = span.attributes['http.request.body_redacted'] as string | undefined;
      expect(captured).toBeDefined();
      expect(captured).toContain('Alice');
      expect(captured).toContain('[REDACTED]');
      expect(captured).not.toContain('hunter2');
    });

    it('captures http.request.headers_redacted with authorization redacted', () => {
      // --- ARRANGE ---
      const err = new ErrorException(AUT.UNAUTHENTICATED);
      const { host } = buildHost({
        method: 'GET',
        url: '/api/v1/me',
        headers: {
          authorization: 'Bearer super.secret.token',
          'content-type': 'application/json',
        },
      });

      // --- ACT ---
      const span = runInSpan(() => filter.catch(err, host));

      // --- ASSERT ---
      const captured = span.attributes['http.request.headers_redacted'] as string | undefined;
      expect(captured).toBeDefined();
      expect(captured).toContain('[REDACTED]');
      expect(captured).not.toContain('super.secret.token');
      expect(captured).toContain('application/json');
    });

    it('emits the "[body not parsed …]" sentinel on middleware-error 401', () => {
      // --- ARRANGE --- the auth middleware threw BEFORE body-parser ran;
      // `request.body` is therefore undefined.
      const err = new ErrorException(AUT.UNAUTHENTICATED);
      const { host } = buildHost({
        method: 'POST',
        url: '/api/v1/tweets',
        body: undefined,
      });

      // --- ACT ---
      const span = runInSpan(() => filter.catch(err, host));

      // --- ASSERT ---
      const captured = span.attributes['http.request.body_redacted'] as string | undefined;
      expect(captured).toBe('[body not parsed — middleware error]');
    });

    it('does not set body-capture attributes when the filter is never invoked (success path)', () => {
      // --- ARRANGE --- model a successful request: a span runs to completion
      // without ever calling `filter.catch`. No body-capture attributes should
      // appear on the span — they are strictly an error-path feature.
      const { host } = buildHost({
        method: 'GET',
        url: '/api/v1/healthy',
        body: { password: 'hunter2' }, // would normally trigger capture
      });
      void host; // unused — the request is referenced only to set up context

      // --- ACT --- execute a span WITHOUT calling the filter.
      const span = runInSpan(() => {
        /* no-op controller handler */
      });

      // --- ASSERT --- none of the body-capture attributes are present.
      expect(span.attributes['http.request.body_redacted']).toBeUndefined();
      expect(span.attributes['http.request.headers_redacted']).toBeUndefined();
      expect(span.attributes['http.request.query_redacted']).toBeUndefined();
      expect(span.attributes['http.response.body_redacted']).toBeUndefined();
    });

    it('does not call logger.logError with span-recording enabled for 5xx', () => {
      // --- ARRANGE --- 5xx path still logs, but must opt out of span recording
      // because the filter already records exceptions on the span.
      const err = new ErrorException(SRV.INTERNAL_ERROR);
      const { host } = buildHost();

      // --- ACT ---
      runInSpan(() => filter.catch(err, host));

      // --- ASSERT ---
      expect(logger.logError).toHaveBeenCalledTimes(1);
      const options = logger.logError.mock.calls[0][2];
      expect(options).toMatchObject({ recordException: false });
    });
  });
});
