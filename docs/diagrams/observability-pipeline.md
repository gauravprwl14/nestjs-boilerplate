# Observability Pipeline

<!-- DOC-SYNC: Diagram reviewed on 2026-04-17. Pipeline shape unchanged from the pivot; enable with OTEL_ENABLED=true. Please verify visual accuracy before committing. -->

> See `docs/guides/FOR-Observability.md` for the full feature guide.
> See `docs/infrastructure/04-grafana-stack-setup.md` for setup instructions.

## Pipeline Diagram

```mermaid
flowchart LR
    App["NestJS App\n(OTel SDK in-process)"]
    Collector["OTel Collector\n:4317 gRPC"]
    Tempo["Grafana Tempo\n:3200\n(Traces)"]
    Loki["Grafana Loki\n:3100\n(Logs)"]
    Prom["Prometheus\n:9090\n(Metrics)"]
    Grafana["Grafana UI\n:3001"]

    App -->|"OTLP gRPC\nspans + metrics"| Collector
    App -->|"Pino JSON logs\nvia Loki exporter"| Collector
    Collector -->|"Jaeger Thrift"| Tempo
    Collector -->|"Loki push API"| Loki
    Collector -->|"Prometheus remote write"| Prom
    Tempo -->|"TraceQL datasource"| Grafana
    Loki -->|"LogQL datasource"| Grafana
    Prom -->|"PromQL datasource"| Grafana
```

## Signals Captured

### Traces
- All HTTP requests (auto-instrumented via `@opentelemetry/instrumentation-http` + `instrumentation-express`)
- All Prisma queries (auto-instrumented)
- Custom spans via `@Trace()` decorator on service methods
- Custom spans via `@InstrumentClass()` decorator (wraps all public methods)

### Metrics
- HTTP request count (`http_requests_total`)
- HTTP request duration histogram (`http_request_duration_seconds`)
- Custom counters via `@IncrementCounter('metric_name')`
- Custom durations via `@RecordDuration('metric_name')`

### Logs
- Structured JSON via Pino (nestjs-pino)
- Every log record includes: `traceId`, `spanId`, `requestId`, `userId`, `companyId` (when available, via CLS)
- `AppLogger.logEvent(eventName, { attributes })` — semantic event logging (always INFO)
- `AppLogger.logError(eventName, error, { attributes })` — structured error logging (always ERROR, records OTel span status)

## Correlation

Every log record emitted during an HTTP request lifecycle is correlated by:
- `traceId` — OTel trace ID, links log to Tempo trace
- `spanId` — OTel span ID
- `requestId` — UUID injected by `RequestIdMiddleware`, returned as `x-request-id` response header

Grafana supports trace-to-logs correlation via the `traceId` field.

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `OTEL_ENABLED` | Enable/disable OTel SDK | `false` |
| `OTEL_SERVICE_NAME` | Service name in traces | `enterprise-twitter` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTel Collector gRPC endpoint | (required when enabled) |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | Transport: `grpc`, `http`, `http/protobuf` | `grpc` |
