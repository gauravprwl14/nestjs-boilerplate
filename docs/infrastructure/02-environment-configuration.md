# 02 — Environment Configuration

All configuration is validated at startup via Zod (`src/config/schemas/env.schema.ts`).
The app will refuse to start if any required variable is missing or invalid.

## Complete Environment Variables Reference

### Application

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | `development`, `test`, or `production` |
| `APP_NAME` | No | `ai-native-nestjs-backend` | Service name used in logs and traces |
| `APP_PORT` | No | `3000` | HTTP listen port |
| `APP_HOST` | No | `0.0.0.0` | HTTP listen host |
| `API_PREFIX` | No | `api` | URL prefix for all routes |
| `API_VERSION` | No | `v1` | URL version segment |
| `LOG_LEVEL` | No | `info` | `trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent` |

### Database

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection URL (`postgresql://user:pass@host:port/db`) |

### Redis

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REDIS_HOST` | No | `localhost` | Redis hostname |
| `REDIS_PORT` | No | `6379` | Redis port |
| `REDIS_PASSWORD` | No | — | Redis password (leave blank if no auth) |
| `REDIS_DB` | No | `0` | Redis database index |

### Authentication

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_ACCESS_SECRET` | **Yes** | — | ≥ 32 characters; signs access tokens |
| `JWT_ACCESS_EXPIRATION` | No | `15m` | Access token TTL (e.g. `15m`, `1h`) |
| `JWT_REFRESH_SECRET` | **Yes** | — | ≥ 32 characters; signs refresh tokens |
| `JWT_REFRESH_EXPIRATION` | No | `7d` | Refresh token TTL (e.g. `7d`, `30d`) |
| `API_KEY_ENCRYPTION_SECRET` | **Yes** | — | ≥ 32 characters; used for API key hashing |
| `BCRYPT_ROUNDS` | No | `12` | bcrypt cost factor (4–31; 12 is production-safe) |

### OpenTelemetry

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OTEL_ENABLED` | No | `false` | `true` to enable OTel SDK |
| `OTEL_SERVICE_NAME` | No | `ai-native-nestjs-backend` | Trace service name |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Conditional | — | Required when `OTEL_ENABLED=true` (e.g. `http://otel-collector:4317`) |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | No | `grpc` | `grpc`, `http`, or `http/protobuf` |

### Rate Limiting

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `THROTTLE_TTL` | No | `60` | Rate limit window in seconds |
| `THROTTLE_LIMIT` | No | `100` | Max requests per window |

### CORS

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CORS_ORIGINS` | No | `*` | Comma-separated allowed origins or `*` |

### Shutdown

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SHUTDOWN_TIMEOUT_MS` | No | `5000` | Graceful shutdown timeout in milliseconds |

## Example .env.development

```bash
NODE_ENV=development
APP_PORT=3000
LOG_LEVEL=debug

DATABASE_URL=postgresql://postgres:postgres@localhost:5433/todo_dev

REDIS_HOST=localhost
REDIS_PORT=6379

JWT_ACCESS_SECRET=your-super-secret-access-key-minimum-32-chars
JWT_REFRESH_SECRET=your-super-secret-refresh-key-minimum-32-chars
API_KEY_ENCRYPTION_SECRET=your-api-key-encryption-secret-32chars

OTEL_ENABLED=true
OTEL_SERVICE_NAME=ai-native-nestjs-backend-dev
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```

## Production Security Notes

- Never commit `.env.production` to version control.
- Use a secrets manager (AWS Secrets Manager, HashiCorp Vault, Doppler) to inject production values.
- Rotate `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` regularly; rotation invalidates all live tokens.
- Set `BCRYPT_ROUNDS=12` minimum in production; higher values increase security but also CPU cost.
