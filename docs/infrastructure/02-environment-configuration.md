# 02 — Environment Configuration

All configuration is validated at startup via Zod (`src/config/schemas/env.schema.ts`).
The app will refuse to start if any required variable is missing or invalid.

## Complete Environment Variables Reference

### Application

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | `development`, `test`, or `production` |
| `APP_NAME` | No | `enterprise-twitter` | Service name used in logs and traces |
| `APP_PORT` | No | `3000` | HTTP listen port |
| `APP_HOST` | No | `0.0.0.0` | HTTP listen host |
| `API_PREFIX` | No | `api` | URL prefix for all routes |
| `API_VERSION` | No | `1` | URL version segment (no `v` prefix — NestJS adds it) |
| `LOG_LEVEL` | No | `info` | `trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent` |

### Database

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection URL (`postgresql://user:pass@host:port/db`) |

### OpenTelemetry

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OTEL_ENABLED` | No | `false` | `true` to enable OTel SDK |
| `OTEL_SERVICE_NAME` | No | `enterprise-twitter` | Trace service name |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Conditional | — | Required when `OTEL_ENABLED=true` (e.g. `http://otel-collector:4317`) |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | No | `grpc` | `grpc`, `http`, or `http/protobuf` |

### CORS

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CORS_ORIGINS` | No | `*` | Comma-separated allowed origins or `*` |

### Shutdown

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SHUTDOWN_TIMEOUT_MS` | No | `10000` | Graceful shutdown timeout in milliseconds |

## Removed variables (post-pivot)

The following variables existed in earlier builds and are **no longer read**
by the Zod schema:

- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB` — BullMQ removed.
- `JWT_ACCESS_SECRET`, `JWT_ACCESS_EXPIRATION`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRATION` — JWT stack removed.
- `API_KEY_ENCRYPTION_SECRET`, `BCRYPT_ROUNDS` — API Key stack removed.
- `THROTTLE_TTL`, `THROTTLE_LIMIT` — Throttler module removed.

They will be ignored silently if present in your `.env` files but can be
deleted.

## Example .env.development

```bash
NODE_ENV=development
APP_PORT=3000
LOG_LEVEL=debug

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/enterprise_twitter_dev

OTEL_ENABLED=false
OTEL_SERVICE_NAME=enterprise-twitter-dev
# OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```

## Production Security Notes

- Never commit `.env.production` to version control.
- Use a secrets manager (AWS Secrets Manager, HashiCorp Vault, Doppler) to inject production values.
- `DATABASE_URL` should use TLS (`sslmode=require`) in production.
- When swapping the mock-auth for real auth (JWT, etc.), reintroduce the relevant secret env vars via the Zod schema.
