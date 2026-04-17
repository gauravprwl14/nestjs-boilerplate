# FOR-Observability.md — Observability Feature Guide

> Related: `docs/diagrams/observability-pipeline.md`, `docs/infrastructure/04-grafana-stack-setup.md`, `docs/coding-guidelines/08-logging-and-tracing.md`

---

## 1. Business Use Case

Observability answers three questions in production:
- **What happened?** → Structured logs in Loki
- **Where did time go?** → Distributed traces in Tempo
- **How is the system behaving over time?** → Metrics in Prometheus

All three signals are correlated by `traceId`, enabling drill-down from a slow metric → specific trace → exact log lines.

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
├── otel-sdk.ts              # OTel SDK init — MUST run before NestJS bootstrap
├── telemetry.module.ts      # @Global() module; provides TelemetryService
├── telemetry.service.ts     # addSpanAttributes(), getCurrentTraceId(), etc.
├── otel.constants.ts        # Metric names, attribute key constants
├── interfaces/
│   └── telemetry.interfaces.ts
└── decorators/
    ├── trace.decorator.ts           # @Trace('span.name') — wraps method in OTel span
    ├── instrument-class.decorator.ts # @InstrumentClass() — wraps all public methods
    └── metric.decorator.ts          # @IncrementCounter(), @RecordDuration()

src/logger/
├── logger.module.ts         # @Global() module; provides AppLogger
├── logger.service.ts        # AppLogger — logEvent(), logError(), child()
├── logger.interfaces.ts     # ILogger interface
├── logger.config.ts         # Pino transport + formatters config
└── utils/
    ├── sanitizer.util.ts    # Strips sensitive fields before logging
    └── trace-context.util.ts # Extracts traceId/spanId from OTel context
```

---

## 4. Key Methods

### AppLogger

| Method | Usage |
|--------|-------|
| `logEvent(event, payload)` | Semantic domain event: `logEvent('tweet.created', { attributes: { tweetId, companyId } })` |
| `logError(name, error, opts?)` | Structured error log with stack + code + OTel span recording |
| `child(bindings)` | Returns child logger with persistent fields (e.g. `{ userId, companyId }`) |
| `log(msg, { level, attributes? })` | Escape hatch for non-INFO/non-ERROR levels |

### TelemetryService

| Method | Usage |
|--------|-------|
| `addSpanAttributes(attrs)` | Add key-value attrs to current OTel span |
| `getCurrentTraceId()` | Get active traceId string (for logging correlation) |
| `startSpan(name, fn)` | Manually wrap a function in a named span |

### Decorators

```typescript
// Wrap a single method in a span
@Trace('tweets.timeline')
async timeline(): Promise<TimelineTweet[]> { ... }

// Wrap every public method in spans
@InstrumentClass()
export class DepartmentsService { ... }

// Increment a counter each time method is called
@IncrementCounter('tweets_created_total')
async create(dto: CreateTweetDto) { ... }

// Record the method duration as a histogram
@RecordDuration('tweets_timeline_duration_ms')
async timeline() { ... }
```

---

## 5. Error Cases

| Scenario | Behaviour |
|----------|-----------|
| `OTEL_ENABLED=false` | SDK not initialised; all `@Trace` / `@InstrumentClass` calls are no-ops |
| OTel Collector unreachable | Spans are dropped silently; app continues normally |
| Log sanitizer misses a sensitive field | Add the field name to `sanitizer.util.ts`; submit a PR immediately |
| `addSpanAttributes` called with no active span | No-op (OTel API is safe to call without an active context) |

---

## 6. Configuration

| Variable | Purpose | Default |
|----------|---------|---------|
| `OTEL_ENABLED` | Enable OTel SDK | `false` |
| `OTEL_SERVICE_NAME` | Service name in all telemetry signals | `enterprise-twitter` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Collector gRPC endpoint | Required when enabled |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | Transport protocol | `grpc` |
| `LOG_LEVEL` | Minimum log level | `info` |

**Important:** `otel-sdk.ts` must be imported in `main.ts` **before** any NestJS imports.
This ensures auto-instrumentation patches are applied before modules load.

```typescript
// main.ts — correct order
import './telemetry/otel-sdk'; // FIRST
import { NestFactory } from '@nestjs/core'; // SECOND
```
