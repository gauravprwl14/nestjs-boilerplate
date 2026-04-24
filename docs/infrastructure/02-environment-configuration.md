# 02 — Environment Configuration

All configuration is validated at startup via Zod (`src/config/schemas/env.schema.ts`).
The app will refuse to start if any required variable is missing or invalid.

## Complete Environment Variables Reference

### Application

| Variable      | Required | Default            | Description                                                  |
| ------------- | -------- | ------------------ | ------------------------------------------------------------ |
| `NODE_ENV`    | No       | `development`      | `development`, `test`, or `production`                       |
| `APP_NAME`    | No       | `order-management` | Service name used in logs and traces                         |
| `APP_PORT`    | No       | `3000`             | HTTP listen port                                             |
| `APP_HOST`    | No       | `0.0.0.0`          | HTTP listen host                                             |
| `API_PREFIX`  | No       | `api`              | URL prefix for all routes                                    |
| `API_VERSION` | No       | `1`                | URL version segment (no `v` prefix — NestJS adds it)         |
| `LOG_LEVEL`   | No       | `info`             | `trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent` |

### Database — Primary & Replicas (Hot Tier)

| Variable              | Required | Default      | Description                                                              |
| --------------------- | -------- | ------------ | ------------------------------------------------------------------------ |
| `DATABASE_URL`        | **Yes**  | —            | Prisma migrations connection URL (`postgresql://user:pass@host:port/db`) |
| `DB_PRIMARY_HOST`     | No       | `localhost`  | Primary DB host (writes)                                                 |
| `DB_PRIMARY_PORT`     | No       | `5432`       | Primary DB port                                                          |
| `DB_PRIMARY_NAME`     | No       | `primary_db` | Primary DB name                                                          |
| `DB_PRIMARY_USER`     | No       | `ecom_user`  | Primary DB user                                                          |
| `DB_PRIMARY_PASSWORD` | No       | `ecom_pass`  | Primary DB password                                                      |
| `DB_REPLICA_1_HOST`   | No       | `localhost`  | Replica 1 host (reads, round-robin)                                      |
| `DB_REPLICA_1_PORT`   | No       | `5433`       | Replica 1 port                                                           |
| `DB_REPLICA_2_HOST`   | No       | `localhost`  | Replica 2 host (reads, round-robin)                                      |
| `DB_REPLICA_2_PORT`   | No       | `5434`       | Replica 2 port                                                           |

### Database — Metadata / Warm Archive (Tier 3)

| Variable               | Required | Default               | Description          |
| ---------------------- | -------- | --------------------- | -------------------- |
| `DB_METADATA_HOST`     | No       | `localhost`           | Metadata DB host     |
| `DB_METADATA_PORT`     | No       | `5435`                | Metadata DB port     |
| `DB_METADATA_NAME`     | No       | `metadata_archive_db` | Metadata DB name     |
| `DB_METADATA_USER`     | No       | `ecom_user`           | Metadata DB user     |
| `DB_METADATA_PASSWORD` | No       | `ecom_pass`           | Metadata DB password |

### Redis (Planned)

| Variable     | Required | Default     | Description                                    |
| ------------ | -------- | ----------- | ---------------------------------------------- |
| `REDIS_HOST` | No       | `localhost` | Redis host (consumed by planned caching layer) |
| `REDIS_PORT` | No       | `6379`      | Redis port                                     |

### OpenTelemetry

| Variable                      | Required    | Default            | Description                                                           |
| ----------------------------- | ----------- | ------------------ | --------------------------------------------------------------------- |
| `OTEL_ENABLED`                | No          | `false`            | `true` to enable OTel SDK                                             |
| `OTEL_SERVICE_NAME`           | No          | `order-management` | Trace service name                                                    |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Conditional | —                  | Required when `OTEL_ENABLED=true` (e.g. `http://otel-collector:4317`) |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | No          | `grpc`             | `grpc`, `http`, or `http/protobuf`                                    |

### CORS

| Variable       | Required | Default | Description                            |
| -------------- | -------- | ------- | -------------------------------------- |
| `CORS_ORIGINS` | No       | `*`     | Comma-separated allowed origins or `*` |

### Shutdown

| Variable              | Required | Default | Description                               |
| --------------------- | -------- | ------- | ----------------------------------------- |
| `SHUTDOWN_TIMEOUT_MS` | No       | `10000` | Graceful shutdown timeout in milliseconds |

## Removed variables (post-pivot)

The following variables existed in earlier builds and are **no longer read**
by the Zod schema:

- `JWT_ACCESS_SECRET`, `JWT_ACCESS_EXPIRATION`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRATION` — JWT stack removed.
- `API_KEY_ENCRYPTION_SECRET`, `BCRYPT_ROUNDS` — API Key stack removed.
- `THROTTLE_TTL`, `THROTTLE_LIMIT` — Throttler module removed.

> Note: `REDIS_HOST` and `REDIS_PORT` have been **re-added** to the Zod schema
> in the feat/observability pivot. They are parsed and available via
> `AppConfigService.get('REDIS_HOST')` but are not yet consumed by any service.

## Example .env.development

The shipped `.env.development` is Docker-compose-first (service DNS names), so it works out of the box with `docker compose up`:

```bash
NODE_ENV=development
APP_PORT=3000
LOG_LEVEL=debug

# Prisma migrations (primary DB)
DATABASE_URL=postgresql://ecom_user:ecom_pass@localhost:5432/primary_db

# Multi-tier pool config
DB_PRIMARY_HOST=localhost
DB_PRIMARY_PORT=5432
DB_PRIMARY_NAME=primary_db
DB_PRIMARY_USER=ecom_user
DB_PRIMARY_PASSWORD=ecom_pass

DB_REPLICA_1_HOST=localhost
DB_REPLICA_1_PORT=5433
DB_REPLICA_2_HOST=localhost
DB_REPLICA_2_PORT=5434

DB_METADATA_HOST=localhost
DB_METADATA_PORT=5435
DB_METADATA_NAME=metadata_archive_db
DB_METADATA_USER=ecom_user
DB_METADATA_PASSWORD=ecom_pass

REDIS_HOST=localhost
REDIS_PORT=6379

OTEL_ENABLED=false
OTEL_SERVICE_NAME=order-management
# Docker DNS — collector service on the internal network
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
```

When running the app **outside** Docker, swap the service names for `localhost` and use the host-mapped port (`5433` for Postgres, `4317` for the OTel collector).

## Docker Compose overrides

`docker-compose.yml` exposes a handful of compose-level env vars (distinct from
the app's Zod schema) so you can reroute infrastructure without editing YAML.
See `01-docker-setup.md` § _Overridable compose variables_ for the full
table: `POSTGRES_USER/PASSWORD/DB`, `TEMPO_OTLP_GRPC_ENDPOINT`,
`LOKI_OTLP_ENDPOINT`, `PROMETHEUS_REMOTE_WRITE_URL`, `PROMETHEUS_URL`,
`TEMPO_URL`, `LOKI_URL`. All have defaults that match the in-compose service
DNS, so supplying them is only necessary when pointing at external services.

## Production Security Notes

- Never commit `.env.production` to version control.
- Use a secrets manager (AWS Secrets Manager, HashiCorp Vault, Doppler) to inject production values.
- `DATABASE_URL` should use TLS (`sslmode=require`) in production.
- When swapping the mock-auth for real auth (JWT, etc.), reintroduce the relevant secret env vars via the Zod schema.
