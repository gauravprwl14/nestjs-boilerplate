# 01 — Docker Setup

## Services Overview

The `docker-compose.yml` in the project root defines:

| Service          | Image                                | Port       | Purpose                                                                                                    |
| ---------------- | ------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------- |
| `app`            | Local Dockerfile                     | 3000       | NestJS application                                                                                         |
| `postgres`       | postgres:16-alpine                   | 5433→5432  | Primary database                                                                                           |
| `otel-collector` | otel/opentelemetry-collector-contrib | 4317, 4318 | OTel fan-out — receives traces + metrics + logs, pushes to Tempo/Loki/Prometheus (optional)                |
| `tempo`          | grafana/tempo:2.5.0                  | 3200       | Trace storage + Traces Drilldown metrics (optional)                                                        |
| `loki`           | grafana/loki                         | 3100       | Log storage (optional)                                                                                     |
| `prometheus`     | prom/prometheus                      | 9090       | Metrics storage — accepts **remote-write** push from the collector (optional)                              |
| `grafana`        | grafana/grafana:12.0.0               | 3001→3000  | Observability UI with `grafana-exploretraces-app` + `grafana-lokiexplore-app` Drilldown plugins (optional) |

> Redis is no longer part of this build — BullMQ has been removed.

## Quick Start

```bash
# Start all services (app + infrastructure)
# The `app` container's command runs:
#   prisma migrate deploy  →  npm run prisma:seed  →  npm run start:dev
# so the first `up` leaves you with a migrated, seeded, hot-reloading API.
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

> **Seed is idempotent.** The seed script in `prisma/seed.ts` skips when any
> companies exist, so subsequent `docker compose up` cycles don't clobber data.
> To force a re-seed: `docker compose exec postgres psql -U postgres -d enterprise_twitter_dev -c 'TRUNCATE company, department, "user", user_department, tweet, tweet_department CASCADE'` and restart the `app` container.

## Environment File

The app service reads `.env.development`. Required variables for Docker:

```bash
# .env.development (Docker overrides)
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/enterprise_twitter_dev
OTEL_ENABLED=false
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
```

Note: When running the app locally (outside Docker), use `localhost` instead of service names (e.g. `DATABASE_URL=…@localhost:5433/…`, `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317`).

### Overridable compose variables

The `docker-compose.yml` resolves the following from the host shell (or a top-level `.env` file) with sensible fall-back defaults, so you can point compose at custom credentials or external observability backends without editing YAML:

| Variable                      | Default                               | Used by                                       |
| ----------------------------- | ------------------------------------- | --------------------------------------------- |
| `POSTGRES_USER`               | `postgres`                            | `postgres` service + its healthcheck          |
| `POSTGRES_PASSWORD`           | `postgres`                            | `postgres` service                            |
| `POSTGRES_DB`                 | `enterprise_twitter_dev`              | `postgres` service                            |
| `TEMPO_OTLP_GRPC_ENDPOINT`    | `tempo:4317`                          | `otel-collector` → Tempo (trace export)       |
| `LOKI_OTLP_ENDPOINT`          | `http://loki:3100/otlp`               | `otel-collector` → Loki (log export)          |
| `PROMETHEUS_REMOTE_WRITE_URL` | `http://prometheus:9090/api/v1/write` | `tempo` metrics-generator remote-write        |
| `PROMETHEUS_URL`              | `http://prometheus:9090`              | `grafana` datasource (provisioning expansion) |
| `TEMPO_URL`                   | `http://tempo:3200`                   | `grafana` datasource                          |
| `LOKI_URL`                    | `http://loki:3100`                    | `grafana` datasource                          |

## Dockerfile

`docker/Dockerfile` uses a multi-stage build:

- `base` — node:22-alpine + dependencies
- `dependencies` — runs `npm install --ignore-scripts` (skips husky, avoids npm-ci lockfile drift) and `npx prisma generate --schema=src/database/prisma/schema.prisma`
- `development` — includes devDependencies + `nest start --watch` (default CMD; overridden by compose to run migrate + seed first)
- `builder` — compiles TypeScript to `dist/`
- `production` — build artifact only, minimal image, non-root user

The Prisma schema lives at `src/database/prisma/schema.prisma` (per `package.json → prisma.schema`) — `prisma generate` uses the explicit `--schema` flag everywhere. A root-level `.dockerignore` excludes `node_modules`, `docs/`, `test/`, and local env files from the build context.

## Volumes

| Volume            | Purpose                                |
| ----------------- | -------------------------------------- |
| `postgres-data`   | PostgreSQL data persistence            |
| `tempo-data`      | Trace storage (optional stack)         |
| `loki-data`       | Log storage (optional stack)           |
| `prometheus-data` | Metrics storage (optional stack)       |
| `grafana-data`    | Dashboard definitions (optional stack) |

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
