/**
 * End-to-end observability verification.
 *
 * Proves that the full OpenTelemetry pipeline — `@Trace` on controllers,
 * `@InstrumentClass` on services/repositories, `PrismaInstrumentation`,
 * `AllExceptionsFilter` → `recordExceptionOnSpan`, and the Pino trace-context
 * mixin — actually delivers what operators expect to see in Tempo: a
 * connected span hierarchy, OTel-compliant exception events with cause
 * chains, HTTP-semconv-correct span status, and aggressive PII redaction.
 *
 * Uses an in-memory OTel SDK ({@link installInMemoryOtel}) so every span
 * lands in a local exporter — no Tempo/Jaeger dependency required.
 *
 * Some assertions need a live Postgres (supplied via `DATABASE_URL`, same as
 * the tweets e2e). If the DB is not reachable, the affected blocks short-
 * circuit via `it.skip` with a TODO marker.
 */
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SpanStatusCode } from '@opentelemetry/api';
import type { InMemorySpanExporter, ReadableSpan } from '@opentelemetry/sdk-trace-base';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';

import type { InMemoryOtelHandle } from '../helpers/otel-test';
import { assertSpanLacksSubstring, findSpanByName, spanStatusName } from '../helpers/find-spans';
import { testHttpSpanMiddleware } from '../helpers/test-http-span';

// The SDK is bootstrapped by `test/helpers/otel-test-setup.ts` via the
// jest-e2e.json `setupFiles` hook — it MUST run before any `http`-touching
// module is imported, otherwise `@opentelemetry/instrumentation-http` cannot
// patch `http.Server.prototype.emit` and no SERVER-kind span is produced.
declare global {
  var __OTEL_TEST__: InMemoryOtelHandle | undefined;
}

// NOTE: Imports below trigger module evaluation (decorator application, OTel
// patching). They MUST come after the type-only imports above so the
// installInMemoryOtel() call in beforeAll runs before any instrumented module
// is loaded. Jest hoists the imports to the top regardless, but the SDK is
// started in beforeAll before Nest compiles the module graph.
import { AppModule } from '../../src/app.module';
import { AppLogger } from '../../src/logger/logger.service';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../../src/common/interceptors/transform.interceptor';
import { TweetsDbService } from '../../src/database/tweets/tweets.db-service';

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://gauravporwal@localhost:5432/enterprise_twitter_test?schema=public';

// ─────────────────────────────────────────────────────────────────────────────

describe('observability e2e', () => {
  let app: INestApplication;
  let exporter: InMemorySpanExporter;
  let shutdownOtel: () => Promise<void>;
  let prisma: PrismaClient;
  let dbAvailable = true;

  let userId: string;
  let companyId: string;

  beforeAll(async () => {
    // 1. OTel SDK is already running (started by `setupFiles` — see
    //    `test/helpers/otel-test-setup.ts`). We just grab the exporter and
    //    shutdown handle off the global stash.
    const handle = globalThis.__OTEL_TEST__;
    if (!handle) {
      throw new Error('OTel test harness was not initialised; check jest-e2e.json setupFiles.');
    }
    exporter = handle.exporter;
    shutdownOtel = handle.shutdown;

    // 2. Seed Postgres. The companion `tweets.e2e-spec.ts` truncates the DB
    //    at its own `beforeAll`, so creating fixtures here once can race with
    //    that suite when Jest runs both files in parallel workers. Instead
    //    the fixture is created on-demand via `ensureFixture()` in each
    //    `itIfDb` body. That keeps each test resilient to another worker
    //    nuking the DB between runs.
    //    If the DB is unreachable we still run the suite; DB-dependent
    //    tests short-circuit via `itIfDb` below.
    prisma = new PrismaClient({ adapter: new PrismaPg(DATABASE_URL) });
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      dbAvailable = false;
      // eslint-disable-next-line no-console
      console.warn('[observability.e2e] DB unreachable, tests will be skipped:', err);
    }

    // 3. Build the Nest app with the SAME configuration as main.ts — versioning,
    //    ValidationPipe, AllExceptionsFilter, TransformInterceptor — so
    //    decorator-level instrumentation behaves identically to production.
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication({ bufferLogs: true });
    const logger = app.get(AppLogger);
    app.useLogger(logger);

    // Install our test-only SERVER-kind span middleware FIRST so every
    // downstream span (Nest routing, @Trace controller, @InstrumentClass,
    // Prisma) becomes its child. See `test/helpers/test-http-span.ts` for
    // why this exists (Jest ⊥ require-in-the-middle for core modules).
    app.use(testHttpSpanMiddleware());

    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    app.useGlobalFilters(app.get(AllExceptionsFilter));
    app.useGlobalInterceptors(new TransformInterceptor());

    // Listen on an ephemeral port so the real http.Server path (patched by
    // @opentelemetry/instrumentation-http at sdk.start() time) is exercised.
    // Without this, supertest hijacks the Express handler via an in-process
    // emit that bypasses the HTTP instrumentation and no SERVER-kind span
    // is produced.
    await app.listen(0);
  });

  beforeEach(async () => {
    if (dbAvailable) {
      // Another Jest worker (e.g. tweets.e2e-spec.ts) truncates the whole
      // DB between tests. Re-seed the fixture defensively at the top of
      // every test so mock-auth can find our user. A unique company name +
      // email guarantees no collision with concurrent suites.
      const fixtureEmail = `obs-e2e-${Date.now()}-${process.pid}-${Math.random()
        .toString(36)
        .slice(2, 8)}@test`;
      try {
        const existing = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
        if (!existing) {
          const company = await prisma.company.create({ data: { name: 'Observability-Co' } });
          companyId = company.id;
          const user = await prisma.user.create({
            data: { companyId, email: fixtureEmail, name: 'Obs E2E' },
          });
          userId = user.id;
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[observability.e2e] fixture reseed failed:', err);
      }
    }
    // Reset AFTER reseed so the spans emitted by the reseed Prisma queries
    // don't pollute the exporter for the assertion under test.
    exporter.reset();
  });

  afterAll(async () => {
    await app?.close();
    if (prisma) await prisma.$disconnect().catch(() => undefined);
    await shutdownOtel();
  });

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Returns the HTTP server span emitted by `@opentelemetry/instrumentation-http`.
   * That span carries the `http.*` attributes, `error.*` attributes set by the
   * filter, and the exception events recorded by `recordExceptionOnSpan`.
   */
  const findHttpServerSpan = (spans: readonly ReadableSpan[]): ReadableSpan | undefined =>
    spans.find(s => s.kind === 1 /* SERVER */ && s.attributes['http.method'] !== undefined);

  const itIfDb = (desc: string, fn: () => Promise<void>): void => {
    (dbAvailable ? it : it.skip)(desc, fn);
  };

  // ─── 1. Span hierarchy on a GET ─────────────────────────────────────────────

  itIfDb('emits a connected span hierarchy for GET /api/v1/timeline', async () => {
    // Arrange
    const headers = { 'x-user-id': userId };

    // Act
    await request(app.getHttpServer()).get('/api/v1/timeline').set(headers).expect(200);
    const spans = exporter.getFinishedSpans();

    // Assert — HTTP server span exists and is the root of this trace
    const http = findHttpServerSpan(spans);
    expect(http).toBeDefined();

    // Controller @Trace span exists
    expect(findSpanByName(spans, /tweets\.timeline/)).toBeDefined();

    // Service @InstrumentClass span exists (method-level span on TweetsService)
    expect(findSpanByName(spans, /TweetsService/)).toBeDefined();

    // All spans emitted during this request share the same traceId
    const traceIds = new Set(spans.map(s => s.spanContext().traceId));
    expect(traceIds.size).toBe(1);
  });

  // ─── 2. Controller → service → DB chain on a POST ───────────────────────────

  itIfDb('emits controller → service → db-service spans for POST /api/v1/tweets', async () => {
    // Arrange
    const headers = { 'x-user-id': userId };

    // Act
    await request(app.getHttpServer())
      .post('/api/v1/tweets')
      .set(headers)
      .send({ content: 'obs test', visibility: 'COMPANY' })
      .expect(201);
    const spans = exporter.getFinishedSpans();
    const names = spans.map(s => s.name);

    // Assert — each layer contributes at least one named span
    expect(findSpanByName(spans, /tweets\.create/)).toBeDefined();
    expect(names.some(n => /TweetsService/.test(n))).toBe(true);
    expect(names.some(n => /TweetsDbService/.test(n))).toBe(true);
    // The DB layer's transaction entry point (DatabaseService.runInTransaction)
    // should also be present via @InstrumentClass.
    expect(names.some(n => /DatabaseService/.test(n))).toBe(true);

    // And everything is on one trace
    const traceIds = new Set(spans.map(s => s.spanContext().traceId));
    expect(traceIds.size).toBe(1);
  });

  // ─── 3. Prisma P2002 cause chain ────────────────────────────────────────────

  itIfDb('records a Prisma P2002 cause chain on the HTTP span', async () => {
    // Arrange — swap TweetsDbService.createWithTargets for a spy that throws
    // a realistic PrismaClientKnownRequestError(P2002). The filter will
    // normalise this via prisma-error.handler to DAT.UNIQUE_VIOLATION with the
    // original Prisma error preserved as `cause`.
    const tweetsDb = app.get(TweetsDbService);
    const p2002 = new PrismaClientKnownRequestError('Unique constraint failed on tweets', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['tweets_pkey'] },
    });
    const spy = jest.spyOn(tweetsDb, 'createWithTargets').mockRejectedValueOnce(p2002);

    try {
      // Act — the endpoint should reply 409 (DAT.UNIQUE_VIOLATION → CONFLICT)
      await request(app.getHttpServer())
        .post('/api/v1/tweets')
        .set({ 'x-user-id': userId })
        .send({ content: 'dup', visibility: 'COMPANY' })
        .expect(409);

      const spans = exporter.getFinishedSpans();
      const http = findHttpServerSpan(spans);
      expect(http).toBeDefined();
      if (!http) return;

      // Assert — exception + cause.1 events present on the HTTP span
      const eventNames = http.events.map(e => e.name);
      expect(eventNames).toContain('exception');
      expect(eventNames).toContain('exception.cause.1');

      // Cause #1 carries the raw Prisma code
      const cause1 = http.events.find(e => e.name === 'exception.cause.1');
      expect(cause1?.attributes?.['exception.code']).toBe('P2002');

      // Top-level error attributes match the mapped domain code (DAT0003 —
      // UNIQUE_VIOLATION). `error.cause_depth` is at least 2 (top + P2002).
      expect(http.attributes['error.code']).toBe('DAT0003');
      const depth = http.attributes['error.cause_depth'];
      expect(typeof depth === 'number' ? depth : Number(depth)).toBeGreaterThanOrEqual(2);
    } finally {
      spy.mockRestore();
    }
  });

  // ─── 4. PII redaction on span attributes and events ─────────────────────────

  itIfDb('redacts PII from span attributes and span events', async () => {
    // Arrange — deliberately send PII-bearing fields. The request shape is
    // intentionally non-canonical (auth/login doesn't exist in this service),
    // but that's the point: the ValidationPipe + filter run and the stacks
    // flow through `recordExceptionOnSpan`, which should scrub. We hit a real
    // route (POST /tweets) so the HTTP/controller chain emits spans.
    const sensitiveEmail = 'secret-leak@example.com';
    const sensitivePassword = 'hunter2-super-secret';
    const sensitiveToken = 'eyJleaked.secret.token';

    // Missing `visibility` → ZodValidationPipe yields a 400 → filter records
    // the ValidationException on the HTTP span. The HTTP instrumentation also
    // captures request metadata, which is where headers could leak.
    await request(app.getHttpServer())
      .post('/api/v1/tweets')
      .set({ 'x-user-id': userId, authorization: `Bearer ${sensitiveToken}` })
      .send({
        content: 'ignored because validation fails',
        email: sensitiveEmail,
        password: sensitivePassword,
      });

    const spans = exporter.getFinishedSpans();

    // Assert — no span (attribute or event) contains the PII substrings
    for (const s of spans) {
      assertSpanLacksSubstring(s, sensitiveEmail);
      assertSpanLacksSubstring(s, sensitivePassword);
      assertSpanLacksSubstring(s, sensitiveToken);
    }
  });

  // ─── 5. 4xx response: HTTP span status stays UNSET ──────────────────────────

  it('does not mark the HTTP span ERROR for 4xx (unauthenticated)', async () => {
    // Act — missing x-user-id yields 401 AUT0001
    await request(app.getHttpServer()).get('/api/v1/timeline').expect(401);
    const spans = exporter.getFinishedSpans();

    // Assert
    const http = findHttpServerSpan(spans);
    expect(http).toBeDefined();
    if (!http) return;

    // Status stays UNSET per OTel HTTP semconv — a rejected client request is
    // not a server fault. The exception event IS still there, which is how
    // the error surfaces in Tempo without polluting the success rate.
    expect(http.status.code).not.toBe(SpanStatusCode.ERROR);
    expect(spanStatusName(http)).not.toBe('ERROR');

    const eventNames = http.events.map(e => e.name);
    expect(eventNames).toContain('exception');
  });

  // ─── 6. 5xx response: HTTP span status set to ERROR ─────────────────────────

  itIfDb('marks the HTTP span ERROR for 5xx (internal server error)', async () => {
    // Arrange — force an internal (non-ErrorException) throw. The filter wraps
    // it to SRV.INTERNAL_ERROR (HTTP 500), which triggers setStatus(ERROR).
    const tweetsDb = app.get(TweetsDbService);
    const boom = new Error('synthetic internal failure');
    const spy = jest.spyOn(tweetsDb, 'findTimelineForUser').mockRejectedValueOnce(boom);

    try {
      // Act
      await request(app.getHttpServer())
        .get('/api/v1/timeline')
        .set({ 'x-user-id': userId })
        .expect(500);

      const spans = exporter.getFinishedSpans();
      const http = findHttpServerSpan(spans);
      expect(http).toBeDefined();
      if (!http) return;

      // Assert — span status is ERROR and the exception event is present
      expect(http.status.code).toBe(SpanStatusCode.ERROR);
      const eventNames = http.events.map(e => e.name);
      expect(eventNames).toContain('exception');
    } finally {
      spy.mockRestore();
    }
  });

  // ─── 7. Trace-id plumbing is consistent within a single request ─────────────

  itIfDb('assigns a single traceId to every span in one request', async () => {
    // Act
    await request(app.getHttpServer())
      .get('/api/v1/timeline')
      .set({ 'x-user-id': userId })
      .expect(200);
    const spans = exporter.getFinishedSpans();

    // Assert — exactly one traceId covers the whole hierarchy. This is the
    // precondition for `trace_id` in Pino logs to line up with what operators
    // click through from a log line to a Tempo trace.
    const traceIds = new Set(spans.map(s => s.spanContext().traceId));
    expect(traceIds.size).toBe(1);

    // And at least one span is present — proves the whole pipeline is live.
    expect(spans.length).toBeGreaterThan(0);

    // The trace id must be a 32-char hex (OTel format), i.e. not all zeros.
    const [traceId] = [...traceIds];
    expect(traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(traceId).not.toBe('0'.repeat(32));
  });
});
