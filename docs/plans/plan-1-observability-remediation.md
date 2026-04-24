# Plan 1 — Observability Remediation (Tracing, Error Capture, Logger ↔ Span, PII Redaction)

> **For agentic workers:** execute task-by-task via `superpowers:subagent-driven-development`. Steps use `- [ ]` checkboxes. Every code step includes the actual code; no placeholders.

## Overview

**Goal:** Make the application's traces end-to-end visible with full cause chains, safe-by-default PII redaction on both logs and span attributes/events, and a single source of truth for PII paths.
**Branch:** `feat/observability-remediation`
**Status:** Draft

---

## Background

Three parallel reviews of the current boilerplate found:

1. `@Trace` / `@InstrumentClass` decorators exist but are applied **nowhere**. Prisma tracing preview is not enabled and `@prisma/instrumentation` is not installed — so a single request produces only the HTTP auto-instrumentation span with zero child spans.
2. `logError()` calls `span.recordException(err)` once with no `err.cause` walk. Nested Prisma errors (`P2002` code, `meta.target`) are silently dropped before reaching Tempo.
3. Pino has no mixin injecting `trace_id` / `span_id`, so Loki ↔ Tempo pivot links are dead for every log.
4. `AllExceptionsFilter`, `LoggingInterceptor`, and `@Trace` each record the same exception independently with different status rules, producing 2–3 duplicate events per failed request.
5. The existing sanitiser only redacts a handful of Pino paths and never runs on OTel span attributes or events. PII (email, SSN, JWTs) leaks straight into Tempo.

The user requires an enterprise-grade PII redaction system as part of this work — single source of truth, typed, handles nested objects and arrays, covers both logs and traces.

---

## Scope

### In Scope

- Shared cause-chain serialiser + centralised `recordExceptionOnSpan` utility.
- `@Trace` and `@InstrumentClass` applied across controllers, services, database services, and repositories.
- Prisma tracing registered (`@prisma/instrumentation` + `previewFeatures = ["tracing"]`).
- Pino mixin injecting `trace_id`, `span_id`, `trace_flags` on every log record.
- `logger.logEvent` / `logger.logError` wired to `span.addEvent` / `recordExceptionOnSpan`.
- Single error-recording owner per span layer (filter for HTTP span, `@Trace` for child, interceptor records none).
- **Enterprise PII redaction**: single typed registry, `fast-redact`-backed service, regex scrubber for free-form strings, integrated on logs AND span attributes/events.
- Unit tests for every new utility with edge cases (nested arrays, circular refs, already-redacted, PII-in-message, JWT-in-stack).
- E2E verification test using `InMemorySpanExporter` asserting on span hierarchy, exception events, and redaction.

### Out of Scope

- OTel Logs SDK exporter (keep Pino → Loki only; mixin gives us correlation).
- BullMQ tracing — no `src/queue` or processors in the repo currently.
- `@opentelemetry/instrumentation-nestjs-core` — explicit `@Trace` on handlers gives stable span names.
- Rewriting the existing `sanitizer.util.ts` semantics for logger internals (will be delegated to the new `RedactorService`).

---

## Technical Design

### Module map (new / modified)

**New modules:**

- `src/common/redaction/` — PII redaction subsystem.
  - `pii-registry.ts` — typed single source of truth.
  - `string-patterns.ts` — regex patterns for emails, phones, SSN, JWT, cards.
  - `redactor.service.ts` — `fast-redact` wrapper with three methods (`redactObject`, `redactFlatAttributes`, `redactString`).
  - `redaction.module.ts` — `@Global` NestJS module exposing `RedactorService`.
  - `redaction.constants.ts` — `REDACTION_CENSOR`, audit-log event names.
  - `allow-pii.util.ts` — audit helper for `allowPII` escape hatch.
- `src/errors/utils/cause-chain.util.ts` — `serialiseErrorChain` returns typed `SerialisedErrorFrame[]`.
- `src/telemetry/utils/record-exception.util.ts` — `recordExceptionOnSpan(err, opts)`.
- `test/helpers/in-memory-span-exporter.ts` — test-time OTel exporter with assertion helpers.

**Modified files:**

- `package.json` — add `@prisma/instrumentation`, `fast-redact`.
- `src/database/prisma/schema.prisma` — add `previewFeatures = ["tracing"]`.
- `src/telemetry/otel-sdk.ts` — register `PrismaInstrumentation`.
- `src/telemetry/decorators/trace.decorator.ts` — redact attrs; use shared recorder; remove `root` option.
- `src/telemetry/decorators/instrument-class.decorator.ts` — walk full prototype chain.
- `src/logger/logger.config.ts` — Pino `mixin()` for trace context; `redact.paths` sourced from `DEFAULT_PII_PATHS`.
- `src/logger/logger.service.ts` — `logEvent` and `logError` route through `RedactorService` + `recordExceptionOnSpan`; `warn`/`fatal` emit `addEvent` with severity.
- `src/logger/utils/sanitizer.util.ts` — delegate to `RedactorService`; keep back-compat exports.
- `src/common/filters/all-exceptions.filter.ts` — call `recordExceptionOnSpan`; set `http.status_code` span attrs; 4xx=UNSET, 5xx=ERROR.
- `src/common/interceptors/logging.interceptor.ts` — stop recording exceptions on span; set `http.route` + `request.id` attributes on success path.
- `src/errors/types/error-exception.ts` — preserve origin stack; delegate `extractCauseChain` to new util.
- `src/app.module.ts` — import `RedactionModule`.
- `src/modules/*/(controller|service).ts` — add `@Trace` on controller handlers, `@InstrumentClass` on services.
- `src/database/**/*.(db-service|db-repository).ts` — `@InstrumentClass`.
- `src/database/base.repository.ts` — `@InstrumentClass` (so subclasses inherit wrapped methods once the decorator bug is fixed).

### Redaction architecture (detail)

```text
┌────────────────────────────────────────────────────────────────┐
│                   PII_PATH_GROUPS (typed)                     │
│      credentials · identifiers · contact · financial …        │
└────────────────────────────┬───────────────────────────────────┘
                             │ flattened
                             ▼
                  DEFAULT_PII_PATHS (readonly string[])
                             │
            ┌────────────────┼────────────────┐
            ▼                ▼                ▼
        Pino redact   RedactorService   Regex PATTERNS
            │           .redactObject    .redactString
            │           .redactFlatAttrs
            ▼                │                │
       Loki logs             ▼                ▼
                     span.setAttributes   exception.message
                     span.addEvent        exception.stacktrace
```

**Single source of truth** — every PII path lives in `PII_PATH_GROUPS`. Pino and OTel paths both consume `DEFAULT_PII_PATHS`. When a new PII field is introduced anywhere in the product, it is added in exactly one place.

**Redactor modes:**

| Method | Input shape | Use case |
|---|---|---|
| `redactObject<T>(obj, { allow? })` | Nested object / array of objects | `@Trace` args, `logEvent` attributes |
| `redactFlatAttributes(attrs, { allow? })` | `{ 'user.profile.ssn': '…' }` (OTel flat) | Direct span attribute dicts |
| `redactString(str)` | free-form text | `exception.message`, `exception.stacktrace`, cause frame messages |

`redactObject` and `redactFlatAttributes` use `fast-redact` (mutate + restore, not deep-clone). `redactString` uses the `PII_PATTERNS` regex array.

**`allowPII` escape hatch:** every call takes `{ allow?: readonly string[] }`. Paths present in `allow` are removed from the redactor's path list for that call. Each use emits one rate-limited `allow_pii.used` log line (keyed by `path + call-site-file:line`).

### Error recording contract (dedup)

| Layer | Action on exception | Sets span status |
|---|---|---|
| `@Trace` decorator (child span) | `recordExceptionOnSpan(err, { span: child })` | ERROR (unconditional) |
| `LoggingInterceptor` (HTTP path) | log only; **no `recordException`** | no |
| `AllExceptionsFilter` (HTTP span) | `recordExceptionOnSpan(err, { span: active, setStatus: statusCode >= 500 })` | ERROR only if 5xx |
| `logger.logError()` called inside a span | `recordExceptionOnSpan(err)` on the active span | ERROR |

Rule: **exactly one layer records per span**. The filter never touches child spans; `@Trace` never touches the HTTP span; the interceptor touches neither.

---

## Implementation Steps

Each work package (WP) is a sequence of bite-sized tasks. Follow TDD inside each task: write failing test, run to see it fail, implement, run to see it pass, commit.

### WP-1 — Foundation: cause-chain serialiser

**Files:**
- Create: `src/errors/utils/cause-chain.util.ts`
- Create: `src/errors/utils/cause-chain.util.spec.ts`

- [ ] **W1.1** Write failing test for single-error serialisation

  ```ts
  // src/errors/utils/cause-chain.util.spec.ts
  import { serialiseErrorChain } from './cause-chain.util';
  import { ErrorException } from '@errors/types/error-exception';
  import { DAT } from '@errors/error-codes';

  describe('serialiseErrorChain', () => {
    it('returns a single frame for an error with no cause', () => {
      const err = new Error('boom');
      const frames = serialiseErrorChain(err);
      expect(frames).toHaveLength(1);
      expect(frames[0]).toMatchObject({ name: 'Error', message: 'boom' });
      expect(frames[0].stack).toBeDefined();
    });
  });
  ```

- [ ] **W1.2** Run: `npm test -- cause-chain.util.spec` → expect FAIL (module not found).

- [ ] **W1.3** Implement minimal util

  ```ts
  // src/errors/utils/cause-chain.util.ts
  import { ErrorException } from '@errors/types/error-exception';

  /**
   * Normalised frame extracted from an error and all its nested `cause`s.
   * Preserves the fields that matter for traces and structured logs
   * without coupling to any specific error library.
   */
  export interface SerialisedErrorFrame {
    readonly name: string;
    readonly message: string;
    readonly code?: string;
    readonly stack?: string;
    readonly meta?: Readonly<Record<string, unknown>>;
    readonly statusCode?: number;
  }

  const DEFAULT_MAX_DEPTH = 10;

  export function serialiseErrorChain(
    err: unknown,
    maxDepth: number = DEFAULT_MAX_DEPTH,
  ): SerialisedErrorFrame[] {
    const frames: SerialisedErrorFrame[] = [];
    const seen = new WeakSet<object>();
    let current: unknown = err;
    let depth = 0;

    while (current != null && depth < maxDepth) {
      if (current instanceof Error) {
        if (seen.has(current)) break;
        seen.add(current);
        frames.push(extractFrame(current));
        current = (current as Error).cause;
      } else {
        frames.push({ name: 'NonErrorCause', message: String(current) });
        break;
      }
      depth++;
    }

    return frames;
  }

  function extractFrame(err: Error): SerialisedErrorFrame {
    const frame: Writable<SerialisedErrorFrame> = {
      name: err.name ?? 'Error',
      message: err.message ?? '',
      stack: err.stack,
    };
    if (err instanceof ErrorException) {
      frame.code = err.code;
      frame.statusCode = err.statusCode;
    }
    const anyErr = err as unknown as { code?: unknown; meta?: unknown };
    if (frame.code == null && typeof anyErr.code === 'string') frame.code = anyErr.code;
    if (anyErr.meta != null && typeof anyErr.meta === 'object') {
      frame.meta = anyErr.meta as Record<string, unknown>;
    }
    return frame;
  }

  type Writable<T> = { -readonly [K in keyof T]: T[K] };
  ```

- [ ] **W1.4** Add edge-case tests (non-error cause, cycle, depth limit, Prisma duck-typing)

  ```ts
  it('walks Error.cause to the leaf', () => {
    const leaf = new Error('leaf');
    const middle = new ErrorException(DAT.QUERY_FAILED, { cause: leaf });
    const frames = serialiseErrorChain(middle);
    expect(frames.map((f) => f.message)).toEqual(['Database query failed.', 'leaf']);
    expect(frames[0].code).toBe('DAT0004');
  });

  it('preserves Prisma code and meta when duck-typed', () => {
    const prismaLike = Object.assign(new Error('Unique constraint'), {
      code: 'P2002',
      meta: { target: ['email'] },
    });
    const frames = serialiseErrorChain(prismaLike);
    expect(frames[0].code).toBe('P2002');
    expect(frames[0].meta).toEqual({ target: ['email'] });
  });

  it('stops at non-error causes', () => {
    const err = Object.assign(new Error('outer'), { cause: 'string-cause' });
    const frames = serialiseErrorChain(err);
    expect(frames).toHaveLength(2);
    expect(frames[1]).toEqual({ name: 'NonErrorCause', message: 'string-cause' });
  });

  it('does not loop on cyclic causes', () => {
    const a = new Error('a');
    const b = new Error('b');
    (a as Error & { cause?: unknown }).cause = b;
    (b as Error & { cause?: unknown }).cause = a;
    expect(serialiseErrorChain(a)).toHaveLength(2);
  });

  it('respects maxDepth', () => {
    let err: Error = new Error('leaf');
    for (let i = 0; i < 20; i++) err = new Error(`wrap-${i}`, { cause: err });
    const frames = serialiseErrorChain(err, 5);
    expect(frames).toHaveLength(5);
  });
  ```

- [ ] **W1.5** Run all tests in that file → expect PASS.

- [ ] **W1.6** Commit

  ```bash
  git add src/errors/utils/cause-chain.util.ts src/errors/utils/cause-chain.util.spec.ts
  git commit -m "feat(errors): add cause-chain serialiser with cycle and depth guards"
  ```

### WP-2 — Foundation: `recordExceptionOnSpan`

**Files:**
- Create: `src/telemetry/utils/record-exception.util.ts`
- Create: `src/telemetry/utils/record-exception.util.spec.ts`

- [ ] **W2.1** Write failing test that inspects emitted span events

  ```ts
  // src/telemetry/utils/record-exception.util.spec.ts
  import { context, trace, SpanStatusCode } from '@opentelemetry/api';
  import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
  import { recordExceptionOnSpan } from './record-exception.util';
  import { ErrorException } from '@errors/types/error-exception';
  import { DAT } from '@errors/error-codes';

  describe('recordExceptionOnSpan', () => {
    const exporter = new InMemorySpanExporter();
    const provider = new BasicTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
    provider.register();
    const tracer = trace.getTracer('test');

    beforeEach(() => exporter.reset());

    it('emits exception event and sets ERROR status on active span', () => {
      tracer.startActiveSpan('root', (span) => {
        recordExceptionOnSpan(new Error('boom'));
        span.end();
      });
      const [exported] = exporter.getFinishedSpans();
      expect(exported.events[0].name).toBe('exception');
      expect(exported.events[0].attributes?.['exception.message']).toBe('boom');
      expect(exported.status.code).toBe(SpanStatusCode.ERROR);
    });
  });
  ```

- [ ] **W2.2** Run → FAIL.

- [ ] **W2.3** Implement

  ```ts
  // src/telemetry/utils/record-exception.util.ts
  import { Span, SpanStatusCode, trace } from '@opentelemetry/api';
  import { ErrorException } from '@errors/types/error-exception';
  import {
    serialiseErrorChain,
    type SerialisedErrorFrame,
  } from '@errors/utils/cause-chain.util';

  export interface RecordExceptionOptions {
    readonly span?: Span;
    readonly setStatus?: boolean;
    readonly redactString?: (s: string) => string;
  }

  /**
   * Emit one `exception` event plus one `exception.cause.N` event per nested
   * cause on the target span. Sets status to ERROR unless explicitly disabled.
   * Uses OTel semantic conventions for event name and attribute keys.
   */
  export function recordExceptionOnSpan(
    err: unknown,
    opts: RecordExceptionOptions = {},
  ): void {
    const span = opts.span ?? trace.getActiveSpan();
    if (!span) return;

    const frames = serialiseErrorChain(err);
    if (frames.length === 0) return;

    const scrub = opts.redactString ?? identity;

    frames.forEach((frame, i) => {
      span.addEvent(i === 0 ? 'exception' : `exception.cause.${i}`, {
        'exception.type': frame.name,
        'exception.message': scrub(frame.message),
        'exception.stacktrace': frame.stack ? scrub(frame.stack) : '',
        ...(frame.code != null ? { 'exception.code': frame.code } : {}),
        ...(frame.meta != null
          ? { 'exception.meta': safeJson(frame.meta) }
          : {}),
      });
    });

    if (err instanceof ErrorException) {
      span.setAttributes({
        'error.code': err.code,
        'error.type': err.definition.errorType,
        'error.category': err.definition.errorCategory,
        'error.severity': err.definition.severity,
        'error.user_facing': err.definition.userFacing,
        'error.retryable': err.definition.retryable,
        'error.cause_depth': frames.length,
      });
    } else {
      span.setAttribute('error.cause_depth', frames.length);
    }

    if (opts.setStatus !== false) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: frames[0].message });
    }
  }

  function identity<T>(x: T): T {
    return x;
  }

  function safeJson(value: unknown): string {
    try {
      return JSON.stringify(value);
    } catch {
      return '[unserialisable]';
    }
  }
  ```

- [ ] **W2.4** Add cause-chain-visibility test

  ```ts
  it('emits one event per frame of a nested cause chain', () => {
    tracer.startActiveSpan('root', (span) => {
      const leaf = Object.assign(new Error('socket closed'), { code: 'ECONNRESET' });
      const mid = new ErrorException(DAT.QUERY_FAILED, { cause: leaf });
      recordExceptionOnSpan(new ErrorException(DAT.NOT_FOUND, { cause: mid }));
      span.end();
    });
    const [s] = exporter.getFinishedSpans();
    const names = s.events.map((e) => e.name);
    expect(names).toEqual(['exception', 'exception.cause.1', 'exception.cause.2']);
    expect(s.events[2].attributes?.['exception.code']).toBe('ECONNRESET');
    expect(s.attributes?.['error.cause_depth']).toBe(3);
  });

  it('applies redactString to message and stacktrace when provided', () => {
    tracer.startActiveSpan('root', (span) => {
      const err = new Error('user a@x.com failed');
      recordExceptionOnSpan(err, { redactString: (s) => s.replace('a@x.com', '[REDACTED]') });
      span.end();
    });
    const [s] = exporter.getFinishedSpans();
    expect(s.events[0].attributes?.['exception.message']).toBe('user [REDACTED] failed');
  });

  it('does not set status when setStatus=false', () => {
    tracer.startActiveSpan('root', (span) => {
      recordExceptionOnSpan(new Error('x'), { setStatus: false });
      span.end();
    });
    const [s] = exporter.getFinishedSpans();
    expect(s.status.code).toBe(SpanStatusCode.UNSET);
  });
  ```

- [ ] **W2.5** Tests pass → commit

  ```bash
  git add src/telemetry/utils/
  git commit -m "feat(telemetry): add recordExceptionOnSpan util with cause-chain events"
  ```

### WP-3 — PII redaction: registry + string patterns

**Files:**
- Create: `src/common/redaction/pii-registry.ts`
- Create: `src/common/redaction/string-patterns.ts`
- Create: `src/common/redaction/redaction.constants.ts`
- Create: `src/common/redaction/pii-registry.spec.ts`
- Create: `src/common/redaction/string-patterns.spec.ts`

- [ ] **W3.1** Constants

  ```ts
  // src/common/redaction/redaction.constants.ts
  export const REDACTION_CENSOR = '[REDACTED]' as const;
  export const REDACTION_CENSOR_PREFIX = '[REDACTED:' as const;
  export const ALLOW_PII_USED_EVENT = 'security.allow_pii.used' as const;
  export const REDACTION_MAX_STRING_LENGTH = 16_384;
  ```

- [ ] **W3.2** Registry — typed single source of truth

  ```ts
  // src/common/redaction/pii-registry.ts
  export const PII_CATEGORIES = {
    CREDENTIALS: 'credentials',
    IDENTIFIERS: 'identifiers',
    CONTACT: 'contact',
    FINANCIAL: 'financial',
    DEVICE: 'device',
  } as const;
  export type PIICategory = (typeof PII_CATEGORIES)[keyof typeof PII_CATEGORIES];

  export interface PIIPathGroup {
    readonly category: PIICategory;
    readonly severity: 'high' | 'medium';
    readonly description: string;
    readonly paths: readonly string[];
  }

  /**
   * Every PII-bearing path known to the application. Pino and OTel span
   * attribute redaction both read from this registry, so adding a new
   * sensitive field means editing exactly one list here.
   *
   * Path syntax follows fast-redact: dotted paths, `*` for any key (one level),
   * `[*]` for any array index. Use `!path` to exclude.
   */
  export const PII_PATH_GROUPS: Readonly<Record<string, PIIPathGroup>> = {
    credentials: {
      category: PII_CATEGORIES.CREDENTIALS,
      severity: 'high',
      description: 'Passwords, hashes, secrets, tokens, API keys, auth headers',
      paths: [
        '*.password',
        '*.passwordHash',
        '*.passwordConfirmation',
        '*.currentPassword',
        '*.newPassword',
        '*.token',
        '*.accessToken',
        '*.refreshToken',
        '*.ssoToken',
        '*.idToken',
        '*.apiKey',
        '*.apiSecret',
        '*.secret',
        '*.clientSecret',
        '*.privateKey',
        'req.headers.authorization',
        'req.headers["authorization"]',
        'req.headers.cookie',
        'req.headers["cookie"]',
        'req.headers["x-api-key"]',
        'req.headers["x-auth-token"]',
        'res.headers["set-cookie"]',
        '*.headers.authorization',
        '*.headers.cookie',
      ],
    },
    identifiers: {
      category: PII_CATEGORIES.IDENTIFIERS,
      severity: 'high',
      description: 'Government and biometric identifiers',
      paths: ['*.ssn', '*.socialSecurityNumber', '*.nationalId', '*.passportNumber', '*.driverLicense', '*.taxId'],
    },
    contact: {
      category: PII_CATEGORIES.CONTACT,
      severity: 'medium',
      description: 'Email, phone, address, and similar contact fields',
      paths: [
        '*.email',
        '*.emailAddress',
        '*.phone',
        '*.phoneNumber',
        '*.mobile',
        '*.address',
        '*.streetAddress',
        '*.city',
        '*.postalCode',
        '*.zip',
      ],
    },
    financial: {
      category: PII_CATEGORIES.FINANCIAL,
      severity: 'high',
      description: 'Payment instruments and bank details',
      paths: [
        '*.cardNumber',
        '*.cvv',
        '*.cvc',
        '*.pan',
        '*.iban',
        '*.accountNumber',
        '*.routingNumber',
      ],
    },
    device: {
      category: PII_CATEGORIES.DEVICE,
      severity: 'medium',
      description: 'Device and network identifiers',
      paths: ['*.deviceId', '*.macAddress', '*.ipAddress'],
    },
  };

  export const DEFAULT_PII_PATHS: readonly string[] = Object.freeze(
    Object.values(PII_PATH_GROUPS).flatMap((g) => g.paths),
  );
  ```

- [ ] **W3.3** String patterns

  ```ts
  // src/common/redaction/string-patterns.ts
  import { REDACTION_CENSOR_PREFIX } from './redaction.constants';

  export interface PIIStringPattern {
    readonly name: string;
    readonly pattern: RegExp;
    readonly replacement: string;
  }

  /**
   * Regex patterns applied to free-form strings (exception messages, stack traces,
   * HTTP body samples) where structured path-based redaction does not reach.
   * Order matters — earlier patterns take precedence.
   */
  export const PII_STRING_PATTERNS: readonly PIIStringPattern[] = Object.freeze([
    {
      name: 'jwt',
      pattern: /\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g,
      replacement: `${REDACTION_CENSOR_PREFIX}jwt]`,
    },
    {
      name: 'bearer_token',
      pattern: /\b(Bearer|Basic)\s+[A-Za-z0-9+/=._-]+/gi,
      replacement: `$1 ${REDACTION_CENSOR_PREFIX}token]`,
    },
    {
      name: 'email',
      pattern: /\b[\w.!#$%&'*+/=?^_`{|}~-]+@[\w-]+(?:\.[\w-]+)+\b/g,
      replacement: `${REDACTION_CENSOR_PREFIX}email]`,
    },
    {
      name: 'ssn',
      pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
      replacement: `${REDACTION_CENSOR_PREFIX}ssn]`,
    },
    {
      name: 'credit_card',
      pattern: /\b(?:\d[ -]?){13,19}\b/g,
      replacement: `${REDACTION_CENSOR_PREFIX}card]`,
    },
    {
      name: 'phone_e164',
      pattern: /\b\+?\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/g,
      replacement: `${REDACTION_CENSOR_PREFIX}phone]`,
    },
  ]);
  ```

- [ ] **W3.4** Tests for registry and patterns

  ```ts
  // src/common/redaction/pii-registry.spec.ts
  import { DEFAULT_PII_PATHS, PII_PATH_GROUPS } from './pii-registry';

  describe('PII registry', () => {
    it('exposes at least one credential and one identifier path', () => {
      expect(DEFAULT_PII_PATHS).toEqual(expect.arrayContaining(['*.password', '*.ssn']));
    });
    it('has no duplicate paths', () => {
      const dupes = DEFAULT_PII_PATHS.filter(
        (p, i, arr) => arr.indexOf(p) !== i,
      );
      expect(dupes).toEqual([]);
    });
    it('every group declares a category and severity', () => {
      for (const g of Object.values(PII_PATH_GROUPS)) {
        expect(g.category).toBeDefined();
        expect(['high', 'medium']).toContain(g.severity);
        expect(g.paths.length).toBeGreaterThan(0);
      }
    });
  });
  ```

  ```ts
  // src/common/redaction/string-patterns.spec.ts
  import { PII_STRING_PATTERNS } from './string-patterns';

  function scrub(s: string): string {
    let out = s;
    for (const p of PII_STRING_PATTERNS) out = out.replace(p.pattern, p.replacement);
    return out;
  }

  describe('PII string patterns', () => {
    it('redacts email in free-form text', () => {
      expect(scrub('hello alice@example.com bye')).toContain('[REDACTED:email]');
    });
    it('redacts bearer tokens but keeps the scheme', () => {
      expect(scrub('Authorization: Bearer abc.def.ghi-jkl')).toContain('Bearer [REDACTED:token]');
    });
    it('redacts SSN and JWT in stacktrace-like text', () => {
      const s = 'Error: user 123-45-6789 eyJabc.def.ghi failed';
      const out = scrub(s);
      expect(out).toContain('[REDACTED:ssn]');
      expect(out).toContain('[REDACTED:jwt]');
    });
    it('is idempotent', () => {
      const once = scrub('user a@b.co');
      expect(scrub(once)).toBe(once);
    });
    it('redacts 16-digit card with spaces', () => {
      expect(scrub('pan 4111 1111 1111 1111')).toContain('[REDACTED:card]');
    });
    it('does not mangle arbitrary numeric ids', () => {
      expect(scrub('orderId=12345')).toBe('orderId=12345');
    });
  });
  ```

- [ ] **W3.5** Tests pass → commit

  ```bash
  git add src/common/redaction/
  git commit -m "feat(redaction): single-source-of-truth PII registry and string patterns"
  ```

### WP-4 — PII redaction: `RedactorService`

**Files:**
- Create: `src/common/redaction/redactor.service.ts`
- Create: `src/common/redaction/redactor.service.spec.ts`
- Create: `src/common/redaction/redaction.module.ts`
- Create: `src/common/redaction/allow-pii.util.ts`
- Create: `src/common/redaction/allow-pii.util.spec.ts`

- [ ] **W4.1** Install `fast-redact`

  ```bash
  npm install fast-redact@^3.5.0
  npm install -D @types/fast-redact || true
  ```

- [ ] **W4.2** Write failing tests first

  ```ts
  // src/common/redaction/redactor.service.spec.ts
  import { RedactorService } from './redactor.service';

  describe('RedactorService.redactObject', () => {
    const redactor = new RedactorService();

    it('redacts nested credential fields', () => {
      const input = { user: { email: 'a@x.com', password: 'hunter2' } };
      const out = redactor.redactObject(input);
      expect(out.user.password).toBe('[REDACTED]');
      expect(out.user.email).toBe('[REDACTED]');
    });

    it('redacts array of objects', () => {
      const input = { users: [{ ssn: '111-22-3333' }, { ssn: '444-55-6666' }] };
      const out = redactor.redactObject(input);
      expect(out.users[0].ssn).toBe('[REDACTED]');
      expect(out.users[1].ssn).toBe('[REDACTED]');
    });

    it('allowPII opt-in unmasks a path', () => {
      const input = { user: { email: 'a@x.com', password: 'p' } };
      const out = redactor.redactObject(input, { allow: ['*.email'] });
      expect(out.user.email).toBe('a@x.com');
      expect(out.user.password).toBe('[REDACTED]');
    });

    it('is a no-op on primitives', () => {
      expect(redactor.redactObject('string' as any)).toBe('string');
      expect(redactor.redactObject(42 as any)).toBe(42);
      expect(redactor.redactObject(null as any)).toBeNull();
    });

    it('handles circular references without throwing', () => {
      const a: any = { password: 'p' };
      a.self = a;
      expect(() => redactor.redactObject(a)).not.toThrow();
    });
  });

  describe('RedactorService.redactFlatAttributes', () => {
    const redactor = new RedactorService();

    it('redacts OTel-style flat attribute keys', () => {
      const out = redactor.redactFlatAttributes({
        'method.args.user.password': 'p',
        'method.args.user.name': 'alice',
      });
      expect(out['method.args.user.password']).toBe('[REDACTED]');
      expect(out['method.args.user.name']).toBe('alice');
    });

    it('redacts flat indexed array paths', () => {
      const out = redactor.redactFlatAttributes({
        'req.body.users.0.ssn': '111-22-3333',
        'req.body.users.1.ssn': '444-55-6666',
        'req.body.users.0.name': 'alice',
      });
      expect(out['req.body.users.0.ssn']).toBe('[REDACTED]');
      expect(out['req.body.users.1.ssn']).toBe('[REDACTED]');
      expect(out['req.body.users.0.name']).toBe('alice');
    });
  });

  describe('RedactorService.redactString', () => {
    const redactor = new RedactorService();

    it('scrubs email and JWT from free-form text', () => {
      const out = redactor.redactString('user a@x.com token eyJa.b.c failed');
      expect(out).not.toContain('a@x.com');
      expect(out).not.toContain('eyJa.b.c');
    });

    it('returns non-string input unchanged', () => {
      expect(redactor.redactString(undefined as unknown as string)).toBeUndefined();
    });

    it('truncates extremely long strings before scrubbing', () => {
      const huge = 'x'.repeat(100_000);
      const out = redactor.redactString(huge);
      expect(out.length).toBeLessThanOrEqual(16_384 + 32);
    });
  });
  ```

- [ ] **W4.3** Implement service

  ```ts
  // src/common/redaction/redactor.service.ts
  import { Injectable } from '@nestjs/common';
  import fastRedact from 'fast-redact';
  import { DEFAULT_PII_PATHS } from './pii-registry';
  import { PII_STRING_PATTERNS } from './string-patterns';
  import {
    REDACTION_CENSOR,
    REDACTION_MAX_STRING_LENGTH,
  } from './redaction.constants';

  export interface RedactOptions {
    /** Paths from the registry to unmask for this single call. */
    readonly allow?: readonly string[];
  }

  type FlatAttributes = Record<string, unknown>;

  /**
   * Wrapper around fast-redact that (a) sources its paths from
   * {@link DEFAULT_PII_PATHS} so there is one and only one list,
   * (b) supports both nested and OTel-flat attribute shapes, and
   * (c) exposes a regex scrubber for free-form strings.
   *
   * Usage notes:
   *  - fast-redact mutates + restores, so repeated calls on the same object
   *    are safe but NOT thread-safe in the rare case you mutate the object
   *    while reading it elsewhere. Don't pass shared, concurrently-mutated state.
   */
  @Injectable()
  export class RedactorService {
    private readonly defaultRedactor: ReturnType<typeof fastRedact>;

    constructor() {
      this.defaultRedactor = fastRedact({
        paths: [...DEFAULT_PII_PATHS],
        censor: REDACTION_CENSOR,
        serialize: false,
        strict: false,
      });
    }

    /** Redact PII from a nested object in place. Returns the same (mutated) object. */
    redactObject<T>(input: T, opts: RedactOptions = {}): T {
      if (input == null || typeof input !== 'object') return input;
      const redactor = this.pickRedactor(opts.allow);
      try {
        redactor(input as unknown as object);
      } catch {
        // fast-redact in non-strict mode tolerates most inputs; swallow
        // anything unusual rather than nuking a log line.
      }
      return input;
    }

    /** Redact OTel-style flat attribute dictionaries (`{ 'a.b.c': v }`). */
    redactFlatAttributes(
      attrs: FlatAttributes,
      opts: RedactOptions = {},
    ): FlatAttributes {
      if (!attrs || typeof attrs !== 'object') return attrs;
      const nested = unflatten(attrs);
      this.redactObject(nested, opts);
      return flatten(nested);
    }

    /** Scrub emails / phones / SSN / JWT / cards from free-form strings. */
    redactString(input: string): string {
      if (typeof input !== 'string' || input.length === 0) return input;
      const slice =
        input.length > REDACTION_MAX_STRING_LENGTH
          ? input.slice(0, REDACTION_MAX_STRING_LENGTH) + '…[truncated]'
          : input;
      let out = slice;
      for (const p of PII_STRING_PATTERNS) out = out.replace(p.pattern, p.replacement);
      return out;
    }

    private pickRedactor(allow?: readonly string[]): ReturnType<typeof fastRedact> {
      if (!allow || allow.length === 0) return this.defaultRedactor;
      const filtered = DEFAULT_PII_PATHS.filter((p) => !allow.includes(p));
      return fastRedact({
        paths: [...filtered],
        censor: REDACTION_CENSOR,
        serialize: false,
        strict: false,
      });
    }
  }

  function unflatten(flat: FlatAttributes): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(flat)) {
      const parts = key.split('.');
      let cursor: Record<string, unknown> = out;
      for (let i = 0; i < parts.length - 1; i++) {
        const k = parts[i];
        if (cursor[k] == null || typeof cursor[k] !== 'object') cursor[k] = {};
        cursor = cursor[k] as Record<string, unknown>;
      }
      cursor[parts[parts.length - 1]] = value;
    }
    return out;
  }

  function flatten(nested: Record<string, unknown>, prefix = ''): FlatAttributes {
    const out: FlatAttributes = {};
    for (const [key, value] of Object.entries(nested)) {
      const k = prefix ? `${prefix}.${key}` : key;
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(out, flatten(value as Record<string, unknown>, k));
      } else {
        out[k] = value;
      }
    }
    return out;
  }
  ```

- [ ] **W4.4** Allow-PII audit util

  ```ts
  // src/common/redaction/allow-pii.util.ts
  const AUDIT_LOG_KEY_CAP = 10_000;
  const audited = new Set<string>();

  /**
   * Returns true the first time a (path, callsite) pair is seen.
   * Subsequent calls with the same key return false so that callers
   * can rate-limit the audit log to one emission per unique escape.
   */
  export function shouldAuditAllowPII(path: string, callsite: string): boolean {
    if (audited.size >= AUDIT_LOG_KEY_CAP) return false;
    const key = `${path}@${callsite}`;
    if (audited.has(key)) return false;
    audited.add(key);
    return true;
  }

  /** @internal test-only reset. */
  export function __resetAllowPIIAudit(): void {
    audited.clear();
  }
  ```

  ```ts
  // src/common/redaction/allow-pii.util.spec.ts
  import { shouldAuditAllowPII, __resetAllowPIIAudit } from './allow-pii.util';

  describe('shouldAuditAllowPII', () => {
    beforeEach(() => __resetAllowPIIAudit());

    it('returns true only on the first emission of a key', () => {
      expect(shouldAuditAllowPII('*.email', 'file.ts:42')).toBe(true);
      expect(shouldAuditAllowPII('*.email', 'file.ts:42')).toBe(false);
      expect(shouldAuditAllowPII('*.email', 'other.ts:7')).toBe(true);
    });
  });
  ```

- [ ] **W4.5** Module

  ```ts
  // src/common/redaction/redaction.module.ts
  import { Global, Module } from '@nestjs/common';
  import { RedactorService } from './redactor.service';

  @Global()
  @Module({
    providers: [RedactorService],
    exports: [RedactorService],
  })
  export class RedactionModule {}
  ```

- [ ] **W4.6** Register in root

  ```ts
  // src/app.module.ts — add to imports array
  import { RedactionModule } from '@common/redaction/redaction.module';
  // ... imports: [AppConfigModule, AppLoggerModule, RedactionModule, ...]
  ```

- [ ] **W4.7** All tests pass → commit

  ```bash
  git add src/common/redaction/ src/app.module.ts package.json package-lock.json
  git commit -m "feat(redaction): fast-redact-backed service with nested/flat/string modes"
  ```

### WP-5 — Wire redaction into Pino + update `ErrorException`

**Files:**
- Modify: `src/logger/logger.config.ts`
- Modify: `src/errors/types/error-exception.ts`
- Modify: `src/errors/types/error-exception.spec.ts` (or create)

- [ ] **W5.1** Update Pino to use the registry and add the trace mixin

  ```ts
  // src/logger/logger.config.ts — inside pinoBaseOptions
  import { trace, isSpanContextValid } from '@opentelemetry/api';
  import { DEFAULT_PII_PATHS } from '@common/redaction/pii-registry';
  import { REDACTION_CENSOR } from '@common/redaction/redaction.constants';
  // ...
  redact: { paths: [...DEFAULT_PII_PATHS], censor: REDACTION_CENSOR },
  // ... inside pinoHttp
  mixin() {
    const span = trace.getActiveSpan();
    const ctx = span?.spanContext();
    if (!ctx || !isSpanContextValid(ctx)) return {};
    return {
      trace_id: ctx.traceId,
      span_id: ctx.spanId,
      trace_flags: `0${ctx.traceFlags.toString(16)}`,
    };
  },
  ```

- [ ] **W5.2** Append cause stack in `ErrorException` constructor so origin survives wrapping

  ```ts
  // src/errors/types/error-exception.ts — inside constructor, after Error.captureStackTrace
  const causeStack = (options?.cause as Error | undefined)?.stack;
  if (causeStack) {
    this.stack = `${this.stack ?? ''}\nCaused by: ${causeStack}`;
  }
  ```

- [ ] **W5.3** Delegate `extractCauseChain` and `toLog()` to the new util

  ```ts
  // src/errors/types/error-exception.ts — replace existing extractCauseChain
  import { serialiseErrorChain } from '@errors/utils/cause-chain.util';

  private extractCauseChain(): SerialisedErrorFrame[] {
    return serialiseErrorChain(this.cause);
  }
  ```

- [ ] **W5.4** Tests

  ```ts
  // src/errors/types/error-exception.spec.ts (create if missing)
  it('preserves cause stack by appending to its own stack', () => {
    const leaf = new Error('leaf');
    const wrap = new ErrorException(DAT.QUERY_FAILED, { cause: leaf });
    expect(wrap.stack).toContain('Caused by:');
    expect(wrap.stack).toContain('leaf');
  });
  ```

- [ ] **W5.5** Verify the app still boots + tests green

  ```bash
  npm run test
  npm run type:check
  ```

- [ ] **W5.6** Commit

  ```bash
  git add src/logger/logger.config.ts src/errors/types/error-exception.ts src/errors/types/error-exception.spec.ts
  git commit -m "feat(logger): pino trace-context mixin + error stack preservation"
  ```

### WP-6 — Logger ↔ span bridge (`logEvent`, `logError`, `warn`, `fatal`)

**Files:**
- Modify: `src/logger/logger.service.ts`
- Modify: `src/logger/logger.service.spec.ts`

- [ ] **W6.1** Wire `logEvent` to redact attributes then `span.addEvent`

  ```ts
  // src/logger/logger.service.ts — at top
  import { RedactorService } from '@common/redaction/redactor.service';
  import { recordExceptionOnSpan } from '@telemetry/utils/record-exception.util';
  // constructor: add RedactorService
  ```

  ```ts
  // inside logEvent(name, opts)
  const attrs = opts?.attributes
    ? this.redactor.redactObject({ ...opts.attributes }, { allow: opts.allowPII })
    : undefined;
  // ... pinoLogger.info({ ...attrs }, name);
  const span = trace.getActiveSpan();
  if (span) span.addEvent(name, attrs as Attributes | undefined);
  ```

- [ ] **W6.2** Wire `logError` through `recordExceptionOnSpan`

  ```ts
  // inside logError(name, error, opts)
  recordExceptionOnSpan(error, {
    redactString: (s) => this.redactor.redactString(s),
  });
  const attrs = opts?.attributes
    ? this.redactor.redactObject({ ...opts.attributes }, { allow: opts.allowPII })
    : undefined;
  pinoLogger.error({ err: error, ...attrs }, name);
  ```

- [ ] **W6.3** `warn` / `fatal` emit `addEvent` with severity attribute

  ```ts
  warn(message: unknown, ...optional: unknown[]) {
    this.pinoLogger.warn(message, ...optional);
    trace.getActiveSpan()?.addEvent('log.warn', {
      'log.severity': 'WARN',
      'log.message': typeof message === 'string' ? this.redactor.redactString(message) : undefined,
    });
  }
  ```

- [ ] **W6.4** Tests — happy path + redaction + cause chain

  ```ts
  // src/logger/logger.service.spec.ts — new test block
  it('logEvent redacts email before writing span event', () => {
    const addEvent = jest.fn();
    jest.spyOn(trace, 'getActiveSpan').mockReturnValue({ addEvent } as any);
    logger.logEvent('user.created', { attributes: { email: 'a@x.com' } });
    expect(addEvent).toHaveBeenCalledWith('user.created', expect.objectContaining({ email: '[REDACTED]' }));
  });

  it('logError emits exception events with cause chain', () => {
    // uses InMemorySpanExporter via test helper
    const prisma = Object.assign(new Error('dup'), { code: 'P2002', meta: { target: ['email'] } });
    const wrap = new ErrorException(DAT.CONSTRAINT_VIOLATION, { cause: prisma });
    tracer.startActiveSpan('op', (span) => {
      logger.logError('create.failed', wrap);
      span.end();
    });
    const [s] = exporter.getFinishedSpans();
    expect(s.events.map((e) => e.name)).toEqual(['exception', 'exception.cause.1']);
    expect(s.events[1].attributes?.['exception.code']).toBe('P2002');
  });
  ```

- [ ] **W6.5** Commit

  ```bash
  git add src/logger/
  git commit -m "feat(logger): redact + bridge logEvent/logError/warn to active span"
  ```

### WP-7 — Prisma instrumentation + OTel SDK

**Files:**
- Modify: `package.json`
- Modify: `src/database/prisma/schema.prisma`
- Modify: `src/telemetry/otel-sdk.ts`
- Modify: `src/main.ts` (verify SDK starts before NestFactory)

- [ ] **W7.1** Install Prisma instrumentation

  ```bash
  npm install @prisma/instrumentation@^7
  ```

- [ ] **W7.2** Enable tracing preview in schema

  ```prisma
  // src/database/prisma/schema.prisma
  generator client {
    provider        = "prisma-client-js"
    previewFeatures = ["tracing"]
  }
  ```

  ```bash
  npx prisma generate
  ```

- [ ] **W7.3** Register in OTel SDK

  ```ts
  // src/telemetry/otel-sdk.ts
  import { PrismaInstrumentation } from '@prisma/instrumentation';
  // ...
  instrumentations: [
    getNodeAutoInstrumentations({ /* existing */ }),
    new PrismaInstrumentation({ middleware: true }),
  ],
  ```

- [ ] **W7.4** Manual smoke: `npm run start:dev`, `curl /api/v1/health`, confirm Tempo shows one HTTP span plus `prisma:client:operation` spans when DB calls occur.

- [ ] **W7.5** Commit

  ```bash
  git add package.json package-lock.json src/database/prisma/schema.prisma src/telemetry/otel-sdk.ts
  git commit -m "feat(telemetry): register PrismaInstrumentation and enable tracing preview"
  ```

### WP-8 — Decorator fixes

**Files:**
- Modify: `src/telemetry/decorators/trace.decorator.ts`
- Modify: `src/telemetry/decorators/instrument-class.decorator.ts`
- Modify: `src/telemetry/interfaces/telemetry.interfaces.ts`
- Create: `src/telemetry/decorators/trace.decorator.spec.ts`
- Create: `src/telemetry/decorators/instrument-class.decorator.spec.ts`

- [ ] **W8.1** Fix `@InstrumentClass` prototype-chain walk (covers inherited methods on `BaseRepository`)

  ```ts
  // src/telemetry/decorators/instrument-class.decorator.ts
  export function InstrumentClass(options?: InstrumentClassOptions): ClassDecorator {
    return (target) => {
      const proto = target.prototype;
      const seen = new Set<string>(['constructor']);
      let current: object | null = proto;
      while (current && current !== Object.prototype) {
        for (const key of Object.getOwnPropertyNames(current)) {
          if (seen.has(key)) continue;
          seen.add(key);
          const descriptor = Object.getOwnPropertyDescriptor(current, key);
          if (!descriptor || typeof descriptor.value !== 'function') continue;
          // ... existing filter logic ...
          Trace({ spanName: `${target.name}.${key}`, ...options })(
            proto, key, descriptor,
          );
          Object.defineProperty(proto, key, descriptor);
        }
        current = Object.getPrototypeOf(current);
      }
    };
  }
  ```

- [ ] **W8.2** Remove the misleading `root` option from `@Trace` + update interface

  ```ts
  // src/telemetry/interfaces/telemetry.interfaces.ts — delete `root?: boolean` field
  ```

  ```ts
  // src/telemetry/decorators/trace.decorator.ts — remove `root` usage; use startActiveSpan
  ```

- [ ] **W8.3** Wire `@Trace` to record via `recordExceptionOnSpan` on child span (status only; no cause-chain duplication on child)

  ```ts
  // inside catch block
  recordExceptionOnSpan(err, { span, setStatus: true });
  span.end();
  throw err;
  ```

- [ ] **W8.4** Tests for both decorators

  ```ts
  // src/telemetry/decorators/instrument-class.decorator.spec.ts
  it('wraps inherited methods from a parent class', () => {
    class Base { foo() { return 'foo'; } }
    @InstrumentClass()
    class Child extends Base { bar() { return 'bar'; } }
    // invoke foo() and bar(), assert each emits a span via InMemorySpanExporter
  });
  ```

  ```ts
  // src/telemetry/decorators/trace.decorator.spec.ts
  it('sets span status to ERROR and re-throws on sync throw', () => {
    class C { @Trace() bad() { throw new Error('x'); } }
    expect(() => new C().bad()).toThrow('x');
    // assert the child span has status ERROR and one exception event
  });
  it('handles async Promise rejections', async () => {
    class C { @Trace() async bad() { throw new Error('y'); } }
    await expect(new C().bad()).rejects.toThrow('y');
  });
  ```

- [ ] **W8.5** Commit

  ```bash
  git add src/telemetry/decorators/ src/telemetry/interfaces/
  git commit -m "fix(telemetry): decorator prototype walk, drop misleading root option, wire recorder"
  ```

### WP-9 — Apply decorators across services, repos, controllers

**Files:**
- Modify: every `src/modules/*/(*.controller.ts|*.service.ts)`
- Modify: every `src/database/*/*.service.ts` and `*.repository.ts`
- Modify: `src/database/base.repository.ts`
- Modify: `src/database/database.service.ts`

- [ ] **W9.1** Services: add `@InstrumentClass()` above `@Injectable()` in all of:
  - `src/modules/auth/auth.service.ts`
  - `src/modules/auth/api-keys.service.ts`
  - `src/modules/users/users.service.ts`
  - `src/modules/todo-lists/todo-lists.service.ts`
  - `src/modules/todo-items/todo-items.service.ts`
  - `src/modules/tags/tags.service.ts`
  - `src/modules/health/health.service.ts` (if exists)

- [ ] **W9.2** Database layer:
  - `src/database/database.service.ts`
  - `src/database/base.repository.ts`
  - `src/database/auth-credentials/auth-credentials.(db-service|db-repository).ts`
  - `src/database/users/users.(db-service|db-repository).ts`
  - `src/database/todo-lists/todo-lists.(db-service|db-repository).ts`
  - `src/database/todo-items/todo-items.(db-service|db-repository).ts`
  - `src/database/tags/tags.(db-service|db-repository).ts`

- [ ] **W9.3** Controllers: explicit `@Trace({ spanName: '<controller>.<action>' })` on each handler method. Don't use `@InstrumentClass` here — we want stable span names excluding lifecycle hooks.
  - Example: `src/modules/todo-lists/todo-lists.controller.ts` — add `@Trace({ spanName: 'todoLists.create' })` on `create`, `todoLists.findAll` on `findAll`, etc.

- [ ] **W9.4** Verify end-to-end with an integration-ish smoke test using `InMemorySpanExporter` (see WP-11). At this stage `npm run test` should still be green — decorators are idempotent-safe if the SDK isn't running.

- [ ] **W9.5** Commit

  ```bash
  git add src/modules/ src/database/
  git commit -m "feat(telemetry): apply @Trace and @InstrumentClass across services, repos, and controllers"
  ```

### WP-10 — Dedupe error recording (filter / interceptor)

**Files:**
- Modify: `src/common/filters/all-exceptions.filter.ts`
- Modify: `src/common/interceptors/logging.interceptor.ts`
- Modify: `src/common/filters/all-exceptions.filter.spec.ts` (create if missing)

- [ ] **W10.1** Filter: replace ad-hoc `span.recordException` with `recordExceptionOnSpan`, set status by status-class

  ```ts
  // src/common/filters/all-exceptions.filter.ts
  import { recordExceptionOnSpan } from '@telemetry/utils/record-exception.util';
  // inside catch(exception, host)
  const span = trace.getActiveSpan();
  if (span) {
    recordExceptionOnSpan(error, {
      span,
      setStatus: error.statusCode >= 500,
      redactString: (s) => this.redactor.redactString(s),
    });
    span.setAttributes({
      'http.status_code': error.statusCode,
      'http.method': request.method,
      'http.route': request.route?.path ?? request.url,
    });
  }
  ```

- [ ] **W10.2** Interceptor: remove any exception recording; keep success-path attribute enrichment

  ```ts
  // src/common/interceptors/logging.interceptor.ts
  // remove all span.recordException / setStatus calls from error tap
  // on success, set request.id and http.route attributes if not already set
  ```

- [ ] **W10.3** Tests

  ```ts
  it('filter records exception once with cause chain and sets ERROR for 5xx', async () => {
    // fire a handler that throws SRV.INTERNAL_ERROR wrapping a Prisma P2002
    // assert: HTTP span has exactly one `exception` event + one `exception.cause.1`
    // assert: span.status.code === SpanStatusCode.ERROR
  });

  it('filter does NOT set ERROR status for 4xx but still records exception', async () => {
    // throw AUT.UNAUTHENTICATED (401)
    // assert: span has `exception` event, status UNSET
  });
  ```

- [ ] **W10.4** Commit

  ```bash
  git add src/common/filters/ src/common/interceptors/
  git commit -m "refactor(errors): single authoritative exception recorder per span layer"
  ```

### WP-11 — E2E span verification harness

**Files:**
- Create: `test/helpers/span-exporter.ts`
- Create: `test/e2e/observability.e2e-spec.ts`

- [ ] **W11.1** Test helper

  ```ts
  // test/helpers/span-exporter.ts
  import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
  import { trace } from '@opentelemetry/api';

  export function installInMemoryTracer(): InMemorySpanExporter {
    const exporter = new InMemorySpanExporter();
    const provider = new BasicTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
    provider.register();
    return exporter;
  }

  export function findSpan(spans: ReadonlyArray<any>, name: string) {
    return spans.find((s) => s.name === name);
  }
  ```

- [ ] **W11.2** E2E tests

  ```ts
  // test/e2e/observability.e2e-spec.ts
  describe('observability e2e', () => {
    let app: INestApplication;
    let exporter: InMemorySpanExporter;

    beforeAll(async () => {
      exporter = installInMemoryTracer();
      const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = mod.createNestApplication();
      await app.init();
    });

    beforeEach(() => exporter.reset());
    afterAll(() => app.close());

    it('emits end-to-end span hierarchy for POST /todo-lists', async () => {
      await request(app.getHttpServer()).post('/api/v1/todo-lists').send({ name: 'T' }).expect(201);
      const spans = exporter.getFinishedSpans();
      expect(spans.some((s) => /TodoListsController\.create/.test(s.name))).toBe(true);
      expect(spans.some((s) => /TodoListsService/.test(s.name))).toBe(true);
      expect(spans.some((s) => /TodoListsDbRepository/.test(s.name))).toBe(true);
    });

    it('records exception with cause chain when Prisma throws P2002', async () => {
      await request(app.getHttpServer()).post('/api/v1/auth/register').send(sample).expect(201);
      await request(app.getHttpServer()).post('/api/v1/auth/register').send(sample).expect(409);
      const spans = exporter.getFinishedSpans();
      const http = spans.find((s) => s.name === 'POST /api/v1/auth/register' && s.kind === 1);
      expect(http.events.map((e) => e.name)).toEqual(expect.arrayContaining(['exception']));
      const cause = http.events.find((e) => e.name === 'exception.cause.1');
      expect(cause.attributes['exception.code']).toBe('P2002');
    });

    it('redacts email and password from span attributes and events', async () => {
      await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: 'a@x.com', password: 'hunter2' });
      const spans = exporter.getFinishedSpans();
      for (const s of spans) {
        for (const attr of Object.values(s.attributes ?? {})) {
          if (typeof attr === 'string') {
            expect(attr).not.toContain('a@x.com');
            expect(attr).not.toContain('hunter2');
          }
        }
        for (const ev of s.events ?? []) {
          for (const attr of Object.values(ev.attributes ?? {})) {
            if (typeof attr === 'string') {
              expect(attr).not.toContain('a@x.com');
              expect(attr).not.toContain('hunter2');
            }
          }
        }
      }
    });

    it('does not set ERROR status for 4xx responses', async () => {
      await request(app.getHttpServer()).get('/api/v1/users/me').expect(401);
      const spans = exporter.getFinishedSpans();
      const http = spans.find((s) => s.name.includes('/users/me'));
      expect(http.status.code).not.toBe(2 /* ERROR */);
      expect(http.events.some((e) => e.name === 'exception')).toBe(true);
    });
  });
  ```

- [ ] **W11.3** Commit

  ```bash
  git add test/
  git commit -m "test(observability): e2e span hierarchy + cause chain + redaction assertions"
  ```

### WP-12 — Manual Grafana walkthrough (documentation)

- [ ] **W12.1** Update `docs/guides/FOR-Observability.md` with:
  - The new `recordExceptionOnSpan` contract.
  - The redaction registry and how to add a new PII field.
  - The Tempo check list (see Testing Plan below).
- [ ] **W12.2** Commit

  ```bash
  git add docs/guides/FOR-Observability.md
  git commit -m "docs(observability): document recordException contract and redaction registry"
  ```

---

## Testing Plan

- [ ] `src/errors/utils/cause-chain.util.spec.ts` — WP-1 cases.
- [ ] `src/telemetry/utils/record-exception.util.spec.ts` — WP-2 cases.
- [ ] `src/common/redaction/pii-registry.spec.ts`, `string-patterns.spec.ts` — WP-3.
- [ ] `src/common/redaction/redactor.service.spec.ts`, `allow-pii.util.spec.ts` — WP-4.
- [ ] `src/errors/types/error-exception.spec.ts` — WP-5.
- [ ] `src/logger/logger.service.spec.ts` — WP-6 (new blocks).
- [ ] `src/telemetry/decorators/trace.decorator.spec.ts`, `instrument-class.decorator.spec.ts` — WP-8.
- [ ] `src/common/filters/all-exceptions.filter.spec.ts` — WP-10 dedup and status rule.
- [ ] `test/e2e/observability.e2e-spec.ts` — WP-11 end-to-end checks.
- [ ] Manual Tempo/Loki walkthrough (WP-12 doc):
  1. `docker compose -f docker/grafana/docker-compose.yml up -d`.
  2. `OTEL_ENABLED=true npm run start:dev`.
  3. `curl -i -X POST http://localhost:3000/api/v1/auth/register -H 'Content-Type: application/json' -d '{"email":"a@x.com","password":"p"}'` twice; second returns 409.
  4. Open Tempo. Confirm: full span chain, exception + cause events, `error.code=DAT0001`, `P2002` in cause meta, NO `a@x.com` or `p` anywhere.
  5. In Loki, confirm every log line for that request has the same `trace_id` and no PII.

---

## Rollout / Commit Strategy

Commits land on `feat/observability-remediation`; one PR at the end.

| # | Commit | WP |
|---|---|---|
| 1 | `feat(errors): add cause-chain serialiser with cycle and depth guards` | WP-1 |
| 2 | `feat(telemetry): add recordExceptionOnSpan util with cause-chain events` | WP-2 |
| 3 | `feat(redaction): single-source-of-truth PII registry and string patterns` | WP-3 |
| 4 | `feat(redaction): fast-redact-backed service with nested/flat/string modes` | WP-4 |
| 5 | `feat(logger): pino trace-context mixin + error stack preservation` | WP-5 |
| 6 | `feat(logger): redact + bridge logEvent/logError/warn to active span` | WP-6 |
| 7 | `feat(telemetry): register PrismaInstrumentation and enable tracing preview` | WP-7 |
| 8 | `fix(telemetry): decorator prototype walk, drop misleading root option, wire recorder` | WP-8 |
| 9 | `feat(telemetry): apply @Trace and @InstrumentClass across services, repos, and controllers` | WP-9 |
| 10 | `refactor(errors): single authoritative exception recorder per span layer` | WP-10 |
| 11 | `test(observability): e2e span hierarchy + cause chain + redaction assertions` | WP-11 |
| 12 | `docs(observability): document recordException contract and redaction registry` | WP-12 |

---

## Definition of Done

- [ ] All 12 work packages merged on `feat/observability-remediation`.
- [ ] `npm run test` green.
- [ ] `npm run test:e2e` green (includes new observability suite).
- [ ] `npm run type:check` clean.
- [ ] `npm run lint` clean.
- [ ] Manual Tempo/Loki walkthrough in Testing Plan passes.
- [ ] `docs/guides/FOR-Observability.md` updated.
- [ ] `CLAUDE.md` routing table includes a row for the redaction system if new engineers should discover it.
- [ ] PR opened with summary linking back to this plan and the three review reports.
