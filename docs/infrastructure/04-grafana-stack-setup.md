# 04 — Grafana Stack Setup

## Stack Components

| Component | Role | Port | Config file |
|-----------|------|------|-------------|
| OTel Collector | Receives OTLP, routes to backends | 4317 (gRPC), 4318 (HTTP) | `docker/grafana/otel-collector-config.yml` |
| Grafana Tempo | Trace storage + TraceQL | 3200 | `docker/grafana/tempo.yml` |
| Grafana Loki | Log storage + LogQL | 3100 | `docker/grafana/loki.yml` |
| Prometheus | Metrics storage + PromQL | 9090 | `docker/grafana/prometheus.yml` |
| Grafana UI | Unified dashboards | 3001 (mapped from 3000) | `docker/grafana/provisioning/` |

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
- **Exporters:** `otlp/tempo` (traces), `loki` (logs), `prometheus` (metrics)

To add a new exporter or processor, edit `docker/grafana/otel-collector-config.yml` and restart the collector:

```bash
docker compose restart otel-collector
```

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
2. Query: `http_requests_total`.
3. Results should include your recent requests.

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
