# 01 — Docker Setup

## Services Overview

The `docker-compose.yml` in the project root defines:

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `app` | Local Dockerfile | 3000 | NestJS application |
| `postgres` | postgres:16-alpine | 5433→5432 | Primary database |
| `otel-collector` | otel/opentelemetry-collector-contrib | 4317, 4318, 8889 | OTel fan-out (optional) |
| `tempo` | grafana/tempo | 3200 | Trace storage (optional) |
| `loki` | grafana/loki | 3100 | Log storage (optional) |
| `prometheus` | prom/prometheus | 9090 | Metrics storage (optional) |
| `grafana` | grafana/grafana | 3001→3000 | Observability UI (optional) |

> Redis is no longer part of this build — BullMQ has been removed.

## Quick Start

```bash
# Start all services (app + infrastructure)
docker compose up

# Start Postgres only (run app locally with npm run start:dev)
docker compose up -d postgres

# Optional: add observability backends
docker compose up -d otel-collector tempo loki prometheus grafana

# Check service health
docker compose ps

# Follow app logs
docker compose logs -f app

# Stop all
docker compose down

# Stop and remove volumes (DESTRUCTIVE — loses DB data)
docker compose down -v
```

## Environment File

The app service reads `.env.development`. Required variables for Docker:

```bash
# .env.development (Docker overrides)
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/enterprise_twitter_dev
OTEL_ENABLED=false
# OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
```

Note: When running the app locally (outside Docker), use `localhost` instead of service names.

## Dockerfile

`docker/Dockerfile` uses a multi-stage build:
- `base` — node:22-alpine + dependencies
- `development` — includes devDependencies + `nest start --watch`
- `production` — build artifact only, minimal image

## Volumes

| Volume | Purpose |
|--------|---------|
| `postgres-data` | PostgreSQL data persistence |
| `tempo-data` | Trace storage (optional stack) |
| `loki-data` | Log storage (optional stack) |
| `prometheus-data` | Metrics storage (optional stack) |
| `grafana-data` | Dashboard definitions (optional stack) |

## Health Checks

All infrastructure services have health checks. The `app` service waits for `postgres` to be healthy before starting (`depends_on: { postgres: { condition: service_healthy } }`).

## Grafana Access

After startup, navigate to `http://localhost:3001`. Anonymous access is enabled with Admin role.
Pre-provisioned datasources: Tempo, Loki, Prometheus.

## Troubleshooting

**App fails to start — DB connection refused:**
```bash
# Check postgres is healthy
docker compose ps postgres
# Re-run migrations
docker compose exec app npm run prisma:migrate:dev
```

**OTel Collector not receiving spans:**
```bash
# Check collector logs
docker compose logs otel-collector
# Verify OTEL_ENABLED=true and endpoint is correct
```
