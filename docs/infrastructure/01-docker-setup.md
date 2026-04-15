# 01 — Docker Setup

## Services Overview

The `docker-compose.yml` in the project root defines:

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `app` | Local Dockerfile | 3000 | NestJS application |
| `postgres` | postgres:16-alpine | 5433→5432 | Primary database |
| `redis` | redis:7-alpine | 6379 | BullMQ + cache |
| `otel-collector` | otel/opentelemetry-collector-contrib:0.103.0 | 4317, 4318, 8889 | OTel fan-out |
| `tempo` | grafana/tempo:2.5.0 | 3200 | Trace storage |
| `loki` | grafana/loki:3.1.0 | 3100 | Log storage |
| `prometheus` | prom/prometheus:v2.53.0 | 9090 | Metrics storage |
| `grafana` | grafana/grafana:11.1.0 | 3001→3000 | Observability UI |

## Quick Start

```bash
# Start all services (app + infrastructure)
docker compose up

# Start infrastructure only (run app locally with npm run start:dev)
docker compose up -d postgres redis otel-collector tempo loki prometheus grafana

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
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/todo_dev
REDIS_HOST=redis
REDIS_PORT=6379
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
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
| `redis-data` | Redis AOF/RDB persistence |
| `tempo-data` | Trace storage |
| `loki-data` | Log storage |
| `prometheus-data` | Metrics storage |
| `grafana-data` | Dashboard definitions |

## Health Checks

All infrastructure services have health checks. The `app` service waits for `postgres` and `redis` to be healthy before starting (`depends_on: condition: service_healthy`).

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
