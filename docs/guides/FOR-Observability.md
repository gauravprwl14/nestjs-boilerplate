# FOR-Observability.md — Observability Feature Guide

> Related: `docs/diagrams/observability-pipeline.md`, `docs/infrastructure/04-grafana-stack-setup.md`, `docs/coding-guidelines/08-logging-and-tracing.md`, `docs/plans/plan-1-observability-remediation.md`

This service emits three correlated signals:

- **Traces** — OpenTelemetry spans shipped to Tempo over OTLP/gRPC.
- **Logs** — Pino records shipped to Loki (via the OTel collector), every line stamped with `trace_id` / `span_id` so the Loki → Tempo pivot works for every log produced inside a request.
- **Metrics** — pushed to Prometheus via the collector's `prometheusremotewrite` exporter.

All three signals share a PII redaction subsystem with a single-source-of-truth registry that covers logs, span attributes, and span events.

---

## 1. Business Use Case

Observability answers three questions in production:

- **What happened?** → Structured logs in Loki (`trace_id` → pivot to Tempo).
- **Where did time go?** → Distributed traces in Tempo.
- **How is the system behaving over time?** → Metrics in Prometheus.

---

## 2. Flow Diagram

See `docs/diagrams/observability-pipeline.md` for the full mermaid pipeline diagram.

```
App (OTel SDK)
  → OTLP gRPC → OTel Collector
    → Tempo (traces, TraceQL)
    → Loki (logs, LogQL)
    → Prometheus (metrics, PromQL)
      → Grafana UI (all three datasources)
```

---

## 3. Code Structure

```
src/telemetry/
├── otel-preload.ts                      # Side-effect module — initOtelSdk() runs at import time; MUST be main.ts's first import
├── otel-sdk.ts                          # SDK init — traces/metrics/logs; registers PrismaInstrumentation
├── telemetry.module.ts                  # @Global() module; provides TelemetryService
├── telemetry.service.ts                 # addSpanAttributes(), getCurrentTraceId(), startSpan()
├── otel.constants.ts                    # TRACER_NAME, SPAN_ATTR_CLASS, SPAN_ATTR_METHOD, metric names
├── interfaces/
│   └── telemetry.interfaces.ts          # TraceOptions, InstrumentClassOptions
├── decorators/
│   ├── trace.decorator.ts               # @Trace({ spanName? }) — wraps a method in a child span
│   ├── instrument-class.decorator.ts    # @InstrumentClass() — wraps every public method (walks the prototype chain)
│   └── metric.decorator.ts              # @IncrementCounter(), @RecordDuration()
└── utils/
    └── record-exception.util.ts         # recordExceptionOnSpan() — the one authoritative exception recorder

src/logger/
├── logger.module.ts                     # @Global() module; provides AppLogger
├── logger.service.ts                    # AppLogger — logEvent / logError / log / warn / fatal
├── logger.interfaces.ts                 # IAppLogger, LogLevel, ILogOptions, ILogEventOptions, ILogErrorOptions
├── logger.config.ts                     # Pino transport + trace-context mixin + registry-sourced redact paths
└── utils/
    ├── sanitizer.util.ts                # Back-compat sanitiser; delegates to RedactorService internally
    └── trace-context.util.ts

src/common/redaction/
├── pii-registry.ts                      # PII_PATH_GROUPS, DEFAULT_PII_PATHS — the single source of truth
├── string-patterns.ts                   # Regex scrubber list (jwt, bearer, email, ssn, card, phone)
├── redactor.service.ts                  # RedactorService — redactObject / redactFlatAttributes / redactString
├── redaction.module.ts                  # @Global() module; provides RedactorService
├── redaction.constants.ts               # REDACTION_CENSOR, REDACTION_CENSOR_PREFIX, ALLOW_PII_USED_EVENT
└── allow-pii.util.ts                    # shouldAuditAllowPII() — dedupes audit emissions

src/errors/utils/
└── cause-chain.util.ts                  # serialiseErrorChain() — normalises Error.cause chain into frames
```

---

## 4. Quick start for a new feature

1. **Service** — decorate the class with `@InstrumentClass()`. Every public method gets a child span named `ClassName.method` automatically. Lifecycle hooks (`onModuleInit`, etc.) are excluded by default.
2. **Controller handler** — decorate each handler with `@Trace({ spanName: 'feature.action' })`. Stable span names survive refactors and show up cleanly in Tempo.
3. **Repository / `DbService`** — decorate with `@InstrumentClass()` too. DB calls get wrapped; the Prisma instrumentation additionally emits `prisma:client:operation` and `pg.query` spans underneath.
4. **Ad-hoc PII scrubbing** — inject `RedactorService` if you need to redact something outside the logger/filter paths (e.g. before stashing into CLS or returning a truncated error payload).

The real examples below come straight from `src/modules/tweets/` and `src/database/tweets/` — they compile and are exercised by the test suite.

### Controller — `@Trace` on each handler

```typescript
// src/modules/tweets/tweets.controller.ts
@ApiTags('Tweets')
@ApiSecurity('x-user-id')
@Controller({ version: '1' })
export class TweetsController {
  constructor(private readonly service: TweetsService) {}

  @Post('tweets')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(CreateTweetSchema))
  @Trace({ spanName: 'tweets.create' })
  async create(@Body() dto: CreateTweetDto): Promise<Tweet> {
    return this.service.create(dto);
  }

  @Get('timeline')
  @Trace({ spanName: 'tweets.timeline' })
  async timeline(): Promise<TimelineTweet[]> {
    return this.service.timeline();
  }
}
```

### Service / repository — `@InstrumentClass()`

```typescript
// src/database/tweets/tweets.db-service.ts
@InstrumentClass()
@Injectable()
export class TweetsDbService {
  constructor(
    private readonly repo: TweetsDbRepository,
    private readonly database: DatabaseService,
  ) {}

  async createWithTargets(input: { /* … */ }): Promise<Tweet> {
    /* … */
  }
}
```

No per-method annotation is needed — `@InstrumentClass()` walks the full prototype chain (including inherited methods on `BaseRepository`) and wraps each method exactly once with `@Trace({ spanName: 'ClassName.method' })`.

### The span hierarchy you should see in Tempo

```
HTTP SERVER                                    ← @opentelemetry/instrumentation-http
  └── tweets.create                            ← @Trace on controller handler
        └── TweetsService.create               ← @InstrumentClass on service
              └── TweetsDbService.createWithTargets   ← @InstrumentClass on DB service
                    └── DatabaseService.runInTransaction
                          └── prisma:client:operation   ← @prisma/instrumentation
                                └── pg.query            ← pg auto-instrumentation
```

All spans in a single request share one `traceId` (asserted by `test/e2e/observability.e2e-spec.ts`).

---

## 5. Tracing

### 5.1 Decorators

| Decorator                        | Target | Behaviour                                                                                           |
| -------------------------------- | ------ | --------------------------------------------------------------------------------------------------- |
| `@Trace({ spanName?, kind? })`   | method | Wraps the method in `tracer.startActiveSpan(name, …)`. Works for sync + async. Re-throws unchanged. |
| `@InstrumentClass({ exclude? })` | class  | Walks the prototype chain and applies `@Trace({ spanName: 'ClassName.method' })` to every method.   |

**Span name convention** — use dotted, feature-scoped names for controllers (`tweets.create`, `departments.tree`). `@InstrumentClass` uses `ClassName.method` which is stable across refactors as long as the class keeps its name.

**`@InstrumentClass` prototype walk** — methods inherited from a parent class (e.g. `BaseRepository.findById`) are wrapped once, scoped to the subclass's name. Lifecycle hooks (`constructor`, `onModuleInit`, `onModuleDestroy`, `onApplicationBootstrap`, `onApplicationShutdown`, `beforeApplicationShutdown`) are excluded by default; pass `exclude: ['foo']` to skip additional methods.

**Why decorators aren't DI-managed** — both decorators run at class-declaration time, before the Nest DI container exists. That's why per-call redaction of span events uses a process-level hook (`setDefaultRedactString` in `record-exception.util.ts`) rather than an injected `RedactorService` — see the "What changed from plan" section of `docs/plans/plan-1-observability-remediation.md`.

### 5.2 Recording exceptions

Single source of truth: **`recordExceptionOnSpan(err, { span?, setStatus?, redactString? })`** in `src/telemetry/utils/record-exception.util.ts`.

For each frame in `serialiseErrorChain(err)` (root-most first) it emits:

- `exception` event for frame 0 (OTel semconv name).
- `exception.cause.N` event for each subsequent frame.

Each event carries OTel-standard attributes: `exception.type`, `exception.message` (scrubbed), `exception.stacktrace` (scrubbed), `exception.code` when present, `exception.meta` as JSON when present.

When the root error is an `ErrorException`, it also sets `error.*` span attributes (`error.code`, `error.type`, `error.category`, `error.severity`, `error.user_facing`, `error.retryable`, `error.cause_depth`). For non-`ErrorException`, only `error.cause_depth` is set.

Span status defaults to ERROR; pass `setStatus: false` to skip (used by the HTTP filter for 4xx — see below).

The `redactString` option is applied to both `exception.message` and `exception.stacktrace` before they hit the span. When omitted, the module-level default registered via `setDefaultRedactString` is used (populated at app bootstrap from `RedactorService.redactString`).

### 5.3 Layer ownership — who records on which span

Exactly one layer records per span. This prevents the duplicate-event storm that the plan called out as a pre-fix defect.

| Layer                                    | What it records on which span                                                             | Sets status                           |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------- |
| `@Trace` decorator (child span)          | `recordExceptionOnSpan(err, { span: child, setStatus: true })`                            | ERROR (unconditional)                 |
| `AllExceptionsFilter` (HTTP server span) | `recordExceptionOnSpan(err, { span: active, setStatus: status >= 500, redactString: … })` | ERROR **only** for 5xx (HTTP semconv) |
| `logger.logError()`                      | `recordExceptionOnSpan(err, { redactString: … })` on the active span                      | ERROR (set by the recorder)           |
| `LoggingInterceptor`                     | Logs only — does NOT touch spans                                                          | no                                    |

4xx responses (e.g. unauthenticated, validation) keep the HTTP span status UNSET. The `exception` event is still emitted, so Tempo surfaces the error; the span status is reserved for server faults (5xx). The e2e suite asserts this directly.

---

## 6. Structured logging

### 6.1 `AppLogger` methods

| Method                                       | Level                       | Use case                                                                                               |
| -------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `logEvent(name, { attributes?, allowPII? })` | Always INFO                 | Named structured event. Writes to Pino AND emits `span.addEvent(name, attributes)` on the active span. |
| `logError(name, error, { attributes? })`     | Always ERROR                | Writes to Pino with structured `err` field AND calls `recordExceptionOnSpan` on the active span.       |
| `log(message, { level?, attributes? })`      | Configurable (default INFO) | Escape hatch for non-INFO/non-ERROR levels (e.g. `LogLevel.WARN`).                                     |
| `warn(message)` / `fatal(message)`           | WARN / FATAL                | NestJS `LoggerService` compat. Also emit `log.warn` / `log.fatal` span events carrying `log.severity`. |
| `addSpanAttributes(attrs)`                   | —                           | Attach attributes to the active span directly (attribute-only; no log line).                           |
| `child(contextOrAttrs)`                      | —                           | Returns a new `AppLogger` with merged persistent attributes; does not mutate shared state.             |

Do **not** pass `level:` to `logEvent()` or `logError()`. Those methods have fixed levels. If you need WARN/FATAL use `log()`:

```typescript
// Correct
logger.logEvent('tweet.created', { attributes: { tweetId, companyId } });
logger.logError('db.query.failed', error, { attributes: { query } });
logger.log('process exiting', { level: LogLevel.FATAL, attributes: { signal } });
```

### 6.2 Attribute redaction on every call

Attributes passed to `logEvent` / `logError` are run through `RedactorService.redactObject` before being written to either Pino or the span. The same list of paths (`DEFAULT_PII_PATHS`) powers both Pino's `redact.paths` and the OTel span events, so there is no way for a field name in the registry to leak via one path but not the other.

### 6.3 Trace correlation on every log line

`logger.config.ts` installs a Pino `mixin()` that reads the active span via `trace.getActiveSpan()` and injects `trace_id`, `span_id`, and `trace_flags` on every record:

```typescript
function traceContextMixin(): Record<string, string> {
  const span = trace.getActiveSpan();
  const ctx = span?.spanContext();
  if (!ctx || !isSpanContextValid(ctx)) return {};
  return {
    trace_id: ctx.traceId,
    span_id: ctx.spanId,
    trace_flags: `0${ctx.traceFlags.toString(16)}`,
  };
}
```

Consequence: every log line emitted inside a request scope is pivotable to its trace in Tempo. Bootstrap / shutdown logs (no active span) stay untouched.

### 6.4 `warn` / `fatal` span bridging

NestJS's built-in `LoggerService` only gives you `warn` and `fatal` — no structured event name. We bridge those to the active span as `log.warn` / `log.fatal` span events carrying a `log.severity` attribute. The `log.message` attribute is scrubbed with `RedactorService.redactString` first, so accidents like `logger.warn('user foo@bar.com tried …')` don't leak email addresses into Tempo.

---

## 7. PII redaction (single source of truth)

### 7.1 The registry

`src/common/redaction/pii-registry.ts` declares `PII_PATH_GROUPS` — a typed record of groups (`credentials`, `identifiers`, `contact`, `financial`, `device`). Each group has a `category`, `severity`, human-readable `description`, and an array of `paths`.

`DEFAULT_PII_PATHS` is the flattened, frozen union of every group's paths. It is consumed by:

1. **Pino** — `logger.config.ts` passes `redact: { paths: [...DEFAULT_PII_PATHS], censor: REDACTION_CENSOR }` to `pinoHttp`.
2. **`RedactorService.redactObject`** — used by `AppLogger.logEvent` / `logError` for attribute payloads, and by the `AllExceptionsFilter` indirectly via `logger.logError`.
3. **`RedactorService.redactFlatAttributes`** — used where OTel-style `'a.b.c': v` flat dicts appear (e.g. raw span attributes).
4. **The module-level hook** registered via `setDefaultRedactString` — used by `@Trace` on child-span exception events since decorators can't inject `RedactorService`.

**Path syntax** (fast-redact 3.5):

- Dotted paths: `a.b.c`.
- Single-level wildcard: `*` (crosses exactly one key level, not many — see note below).
- Array index wildcard: `[*]`.
- Bracketed string keys for tokens containing `-` or `.`: `req.headers["x-api-key"]`.

> **Implementation note:** `fast-redact`'s `*` only crosses one level. To keep the registry as the sole list without enumerating every possible depth, `RedactorService.redactObject` runs a bounded DFS walker after `fast-redact` to catch deeply nested leaves whose key name is sensitive. `redactFlatAttributes` uses the same leaf-name set (derived from the registry once at module load) instead of unflatten/flatten round-tripping. Both are documented inline in `redactor.service.ts`.

### 7.2 Adding a new PII field

Edit exactly one place — the right group in `PII_PATH_GROUPS`:

```typescript
// src/common/redaction/pii-registry.ts
contact: {
  category: PII_CATEGORIES.CONTACT,
  severity: 'medium',
  description: 'Email, phone, address, and similar contact fields',
  paths: [
    '*.email',
    '*.emailAddress',
    '*.phone',
    // ← add your new path here
  ],
},
```

Pino's log redaction, span-attribute redaction, span-event redaction, and flat-attribute redaction all start masking the field on the next process start. No other file needs to change.

### 7.3 Regex scrubber for free-form strings

`RedactorService.redactString(s)` runs the input through the `PII_STRING_PATTERNS` list in `string-patterns.ts`. Order matters and is documented inline — JWT → bearer → email → SSN → credit card → E.164 phone.

Used on `exception.message` and `exception.stacktrace` at the HTTP boundary (via the filter's `redactString` option) and by `logger.warn` / `logger.fatal` span bridging. Truncates inputs longer than `REDACTION_MAX_STRING_LENGTH` (16 KiB) before scrubbing to cap worst-case regex cost.

### 7.4 `allowPII` opt-in

Some events legitimately need a registry-listed field in cleartext — e.g. an audit log that records which email just signed up. Use `allowPII`:

```typescript
logger.logEvent('user.created', {
  attributes: { email, userId },
  allowPII: ['*.email'],
});
```

Each unique `(path, callsite)` pair emits one `security.allow_pii.used` audit INFO line (deduped via `shouldAuditAllowPII`). The callsite is derived from a synthetic `new Error().stack` so reviewers can grep the audit trail for every PII escape in one place. Rate-limited to one emission per unique key, capped at 10 000 distinct keys per process.

`allowPII` affects attribute redaction only. Exception messages and stacktraces are always scrubbed.

---

## 8. Running observability locally

1. Start Grafana + Tempo + Loki + Prometheus:
   ```bash
   docker compose -f docker/grafana/docker-compose.yml up -d
   ```
2. Start the app with OTel enabled:
   ```bash
   OTEL_ENABLED=true npm run start:dev
   ```
3. Fire a few requests (create a tweet, hit the timeline).
4. Open Grafana → Explore → Tempo. Search by service name. You should see the full span hierarchy in [§ 4](#the-span-hierarchy-you-should-see-in-tempo).
5. Copy a `trace_id` from any Pino log line in Loki and paste it into Tempo — the pivot should land you on the same trace. If it doesn't, the Pino mixin didn't fire (usually because OTel wasn't preloaded before NestFactory — see [§ 10](#10-configuration)).

### Verifying redaction manually

Fire a request that contains PII in the body and headers, then:

- In Loki, `trace_id | json` — confirm no sensitive values appear anywhere on the record.
- In Tempo, inspect the HTTP span attributes and events — confirm no PII leaks into `http.*`, `error.*`, `exception.*`, or event attributes.

The e2e suite `test/e2e/observability.e2e-spec.ts` is the authoritative programmatic check — see [§ 11](#11-testing).

---

## 9. Error Cases

| Scenario                                       | Behaviour                                                                               |
| ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| `OTEL_ENABLED=false`                           | SDK not initialised; `@Trace` / `@InstrumentClass` no-op; Pino mixin returns `{}`.      |
| OTel Collector unreachable                     | Spans/logs/metrics dropped silently by the exporter; app continues normally.            |
| Log sanitiser misses a sensitive field         | Add the path to the right group in `pii-registry.ts`; that's the only edit needed.      |
| `addSpanAttributes` called with no active span | No-op (the OTel API tolerates this).                                                    |
| Span not created (SDK not running)             | `recordExceptionOnSpan` returns early; no-op.                                           |
| Cyclic `Error.cause` chain                     | `serialiseErrorChain` uses a `WeakSet` and stops at the first revisit.                  |
| `Error.cause` chain longer than 10 frames      | Truncated at `DEFAULT_MAX_DEPTH = 10` in `cause-chain.util.ts` (configurable per call). |
| Non-`Error` cause (e.g. `throw 'oops'`)        | Emitted as a `NonErrorCause` frame with `message: String(cause)` and walk stops there.  |

---

## 10. Configuration

| Variable                      | Purpose                               | Default               |
| ----------------------------- | ------------------------------------- | --------------------- |
| `OTEL_ENABLED`                | Enable OTel SDK                       | `false`               |
| `OTEL_SERVICE_NAME`           | Service name in all telemetry signals | `enterprise-twitter`  |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Collector gRPC endpoint               | Required when enabled |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | Transport protocol                    | `grpc`                |
| `LOG_LEVEL`                   | Minimum log level                     | `info`                |

**Load order:** `src/telemetry/otel-preload.ts` must be imported in `main.ts` **before** any NestJS imports. It is a side-effect module that calls `initOtelSdk()` at module-body evaluation time so auto-instrumentation patches (`@nestjs/core`, `pino`, `http`, Prisma, …) are applied before those modules are required. Calling `initOtelSdk()` later (e.g. inside `bootstrap()`) is too late — `@nestjs/core` and its transitive `pino` are already cached and cannot be patched.

```typescript
// main.ts — correct order
import '@telemetry/otel-preload'; // FIRST — triggers initOtelSdk() as a side effect
import { NestFactory } from '@nestjs/core'; // SECOND
```

### Logs pipeline (Pino → collector → Loki)

- `@opentelemetry/instrumentation-pino` is enabled, so every `pino.info/error/…` call is forwarded to the OTel Logs API with the active `traceId`/`spanId` stamped on each record.
- A `BatchLogRecordProcessor` + `OTLPLogExporter` batches and ships log records over OTLP gRPC.
- The collector's `otlphttp/loki` exporter forwards to Loki (`docker/grafana/otel-collector-config.yml`).

No manual wiring is needed in application code — keep using `AppLogger`.

### Metrics pipeline (push, not scrape)

Metrics are **pushed** via the collector's `prometheusremotewrite` exporter. Prometheus runs with `--web.enable-remote-write-receiver` (set in `docker-compose.yml`). There is no scrape endpoint on the app or the collector.

### Prisma tracing

`src/database/prisma/schema.prisma` enables `previewFeatures = ["tracing"]`, and `otel-sdk.ts` registers `new PrismaInstrumentation({ middleware: true })`. Emitted spans: `prisma:client:operation` (one per Prisma client call) and `pg.query` (from the pg auto-instrumentation).

---

## 11. Testing

The authoritative programmatic check is `test/e2e/observability.e2e-spec.ts`. It boots the full app against an `InMemorySpanExporter` (no Tempo required) and asserts:

1. **Span hierarchy for GET** (`/api/v1/timeline`) — HTTP SERVER span + `tweets.timeline` + `TweetsService` span all present, one `traceId`.
2. **Span hierarchy for POST** (`/api/v1/tweets`) — controller → service → DB service → `DatabaseService` chain, one `traceId`.
3. **Prisma P2002 cause chain** — simulated unique-constraint error produces `exception` + `exception.cause.1` on the HTTP span; `cause.1.attributes['exception.code'] === 'P2002'`; `error.code === 'DAT0003'`; `error.cause_depth >= 2`.
4. **PII redaction** — request carrying email, password, and a JWT-shaped token produces zero spans containing any of those substrings (checked against every span attribute and every event attribute).
5. **4xx does NOT set ERROR status** — unauthenticated request keeps span status UNSET, but the `exception` event IS emitted.
6. **5xx DOES set ERROR status** — forced internal failure sets status ERROR and emits the `exception` event.
7. **Single `traceId` per request** — one id covers the whole hierarchy; pivoting from a Loki log line to Tempo lands on the same trace.

Unit-level coverage lives next to each util:

- `src/errors/utils/cause-chain.util.spec.ts` — cycles, non-Error causes, depth cap, Prisma duck-typing.
- `src/telemetry/utils/record-exception.util.spec.ts` — events, status rules, `redactString`, `setStatus: false`.
- `src/common/redaction/pii-registry.spec.ts` — no duplicates, group invariants.
- `src/common/redaction/string-patterns.spec.ts` — pattern order, idempotence, card-vs-phone precedence.
- `src/common/redaction/redactor.service.spec.ts` — nested / flat / string modes, `allow` opt-in, circular refs.
- `src/common/redaction/allow-pii.util.spec.ts` — dedup by `(path, callsite)`.
- `src/telemetry/decorators/trace.decorator.spec.ts` and `instrument-class.decorator.spec.ts` — sync/async paths, prototype-chain walk, exclusion rules.
- `src/logger/logger.service.spec.ts` — redaction of attributes, cause-chain events via `logError`, `warn`/`fatal` bridging.
- `src/common/filters/all-exceptions.filter.spec.ts` — single-recorder rule, 4xx vs 5xx status.

Run:

```bash
npm test          # unit suite
npm run test:e2e  # e2e suite (includes observability.e2e-spec.ts)
```

---

## 12. Further reading

- `docs/plans/plan-1-observability-remediation.md` — the source of truth for what shipped and why. Includes the "What changed from plan" section.
- `docs/coding-guidelines/08-logging-and-tracing.md` — style rules for event names, attribute keys, span names.
- `docs/diagrams/observability-pipeline.md` — mermaid diagram of the collector path.
