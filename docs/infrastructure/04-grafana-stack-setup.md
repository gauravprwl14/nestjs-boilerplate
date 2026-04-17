# 04 — Grafana Stack Setup

## Stack Components

| Component      | Role                                                                                                       | Port                     | Config file                                |
| -------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------ |
| OTel Collector | Receives OTLP (traces + metrics + logs), routes to backends                                                | 4317 (gRPC), 4318 (HTTP) | `docker/grafana/otel-collector-config.yml` |
| Grafana Tempo  | Trace storage + TraceQL (also runs `local-blocks` for Traces Drilldown)                                    | 3200                     | `docker/grafana/tempo.yml`                 |
| Grafana Loki   | Log storage + LogQL                                                                                        | 3100                     | `docker/grafana/loki.yml`                  |
| Prometheus     | Metrics storage + PromQL — **remote-write receiver** (no scrape of the app)                                | 9090                     | `docker/grafana/prometheus.yml`            |
| Grafana UI     | Unified dashboards; v12.0.0 with `grafana-exploretraces-app` + `grafana-lokiexplore-app` Drilldown plugins | 3001 (mapped from 3000)  | `docker/grafana/provisioning/`             |

## Starting the Stack

```bash
# Start observability stack only
docker compose up -d otel-collector tempo loki prometheus grafana

# Verify all are healthy
docker compose ps
```

## Grafana UI Access

Open `http://localhost:3001`. Anonymous access is enabled with Admin role (dev only).

Pre-provisioned datasources are at `docker/grafana/provisioning/datasources/`.
Dashboards at `docker/grafana/provisioning/dashboards/`.

## OTel Collector Configuration

The collector config (`otel-collector-config.yml`) defines:

- **Receivers:** `otlp` (gRPC :4317, HTTP :4318)
- **Processors:** `batch`, `memory_limiter`
- **Exporters:** `otlp/tempo` (traces), `otlphttp/loki` (logs), `prometheusremotewrite` (metrics — push to Prometheus's remote-write receiver), `debug` (stdout)

The Tempo and Loki exporter endpoints are read from env vars at collector startup (via `${env:VAR}` expansion) so you can redirect to external backends without editing YAML:

| Env var                    | Default                 | Consumed by              |
| -------------------------- | ----------------------- | ------------------------ |
| `TEMPO_OTLP_GRPC_ENDPOINT` | `tempo:4317`            | `otlp/tempo` exporter    |
| `LOKI_OTLP_ENDPOINT`       | `http://loki:3100/otlp` | `otlphttp/loki` exporter |

Tempo itself runs with `-config.expand-env=true` so `PROMETHEUS_REMOTE_WRITE_URL` (default `http://prometheus:9090/api/v1/write`) can be overridden the same way.

To add a new exporter or processor, edit `docker/grafana/otel-collector-config.yml` and restart the collector:

```bash
docker compose restart otel-collector
```

## Grafana Datasource URLs

Datasources are provisioned from `docker/grafana/provisioning/datasources/datasources.yml` using Grafana's `$VAR` expansion. Override these from your environment when pointing Grafana at non-local backends:

| Env var          | Default                  | Datasource |
| ---------------- | ------------------------ | ---------- |
| `PROMETHEUS_URL` | `http://prometheus:9090` | Prometheus |
| `TEMPO_URL`      | `http://tempo:3200`      | Tempo      |
| `LOKI_URL`       | `http://loki:3100`       | Loki       |

## Verifying Traces Reach Tempo

1. Make a request to any API endpoint with `OTEL_ENABLED=true`.
2. Open Grafana → Explore → Select **Tempo** datasource.
3. Search by service name `enterprise-twitter`.
4. Traces should appear within 5–10 seconds.

## Verifying Logs Reach Loki

1. Make a request that generates a log (any request is logged by `LoggingInterceptor`).
2. Open Grafana → Explore → Select **Loki** datasource.
3. Query: `{service_name="enterprise-twitter"}`.

## Verifying Metrics Reach Prometheus

1. Open `http://localhost:9090`.
2. Query one of the auto-instrumented HTTP metrics (semantic-conventions v1.x names):
   - `http_server_duration_milliseconds_count` — request rate / count
   - `http_server_duration_milliseconds_bucket` — latency histogram
3. Results should include your recent requests.

> Metrics arrive in Prometheus via **remote-write from the collector**, not via
> scrape. If no data appears, check the collector logs
> (`podman compose logs otel-collector`) for remote-write errors, and confirm
> Prometheus was started with `--web.enable-remote-write-receiver`.

### Dashboards

`docker/grafana/provisioning/dashboards/` ships two pre-built dashboards:

- **API Overview** — request rate, p50/p95/p99 latency, 4xx/5xx rates, total
  requests. Uses `http_server_duration_milliseconds_*` and `http_target` /
  `http_status_code` (OTel semconv v1.x).
- **System Health** — V8 heap used vs limit (`v8js_memory_heap_used_bytes` /
  `v8js_memory_heap_limit_bytes`), event-loop delay p50/p90/p99, event-loop
  utilisation, V8 heap spaces, GC duration (`v8js_gc_duration_seconds_*`).
  Older `nodejs_heap_size_*` / `nodejs_eventloop_lag_seconds` names have been
  replaced everywhere in favour of the semconv-aligned v8js._ and
  nodejs*eventloop_delay*_ metrics emitted by `@opentelemetry/instrumentation-runtime-node`.

## Trace-to-Log Correlation

Grafana Tempo is configured to link to Loki logs by `traceId`.
When viewing a trace in Tempo, click "Logs for this span" to see correlated log lines.

## Production Observability Stack

For production, replace Docker Compose with:

- **Grafana Cloud** (managed Tempo, Loki, Prometheus) — update OTel exporter endpoints + add auth tokens.
- **Self-hosted k8s** — deploy each component via Helm charts (grafana/tempo, grafana/loki, prometheus-community/kube-prometheus-stack).

Set the following env vars to point to production backends:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=https://<your-otel-collector-or-grafana-cloud-endpoint>
```
