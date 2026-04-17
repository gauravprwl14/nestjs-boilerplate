# 03 — Deployment Checklist

Complete all items before deploying to a new environment.

## Pre-Deploy: Code & Configuration

- [ ] All environment variables in `02-environment-configuration.md` are set for the target environment
- [ ] `DATABASE_URL` points to the correct database (not dev/test)
- [ ] `NODE_ENV=production`
- [ ] `LOG_LEVEL=info` (not `debug` or `trace`)
- [ ] `OTEL_ENABLED=true` and `OTEL_EXPORTER_OTLP_ENDPOINT` is set (if using observability stack)
- [ ] `CORS_ORIGINS` is set to specific allowed origins (not `*`)

> **Before shipping to production, REPLACE `MockAuthMiddleware` with a real
> auth mechanism** (JWT, OIDC, or equivalent) that publishes the same CLS
> tuple `{ USER_ID, COMPANY_ID, USER_DEPARTMENT_IDS }`. Mock auth trusts the
> `x-user-id` header unconditionally and is a complete auth bypass.

## Pre-Deploy: Database

- [ ] Database is accessible from the app tier
- [ ] Migrations are reviewed for backward compatibility (no breaking column drops)
- [ ] `npm run prisma:migrate:deploy` has been tested in staging first
- [ ] Database backups are confirmed before running migrations on production
- [ ] Connection pool settings are appropriate for expected concurrency
- [ ] Composite unique keys and tenancy FKs are present (they are essential for cross-tenant safety)

## Pre-Deploy: Build

```bash
# 1. Type check
npm run type:check

# 2. Lint
npm run lint

# 3. Tests pass (unit + integration + e2e)
npm run test
npm run test:e2e

# 4. Build succeeds
npm run build
```

## Deploy Steps

```bash
# 1. Pull latest image / deploy new container
docker pull <registry>/enterprise-twitter:<tag>

# 2. Run migrations (before starting new app instances)
docker run --env-file .env.production <image> npm run prisma:migrate:deploy

# 3. Start new app instances
docker compose -f docker-compose.prod.yml up -d app

# 4. Verify the app is responding (no /health endpoint ships — use Swagger or the timeline smoke test below)
curl -sS -H "x-user-id: <seeded-user-uuid>" http://<host>:3000/api/v1/timeline | jq .
```

## Post-Deploy Verification

- [ ] `GET /api/v1/timeline` with a seeded `x-user-id` returns `200` with an array (real auth flows when mock-auth is replaced)
- [ ] `GET /api/v1/timeline` **without** `x-user-id` returns `401 AUT0001`
- [ ] `POST /api/v1/tweets` with valid body returns `201`
- [ ] Cross-tenant `departmentIds` in `POST /tweets` returns `400 VAL0008` (prove tenant isolation)
- [ ] Grafana shows incoming traces (if OTel enabled)
- [ ] Logs appear in Loki (Pino → OTel Logs API → collector → Loki), filtered by `service.name = $OTEL_SERVICE_NAME`
- [ ] Metrics arrive in Prometheus via **remote-write** (e.g. `http_server_duration_milliseconds_count` shows recent requests) — Prometheus must run with `--web.enable-remote-write-receiver`

## Rollback Plan

```bash
# Stop the new version
docker compose -f docker-compose.prod.yml stop app

# Roll back to previous image tag
docker compose -f docker-compose.prod.yml up -d app --image <previous-tag>

# If migration is not backward compatible, restore DB from backup
# (no automated DB rollback — migrations must be designed as additive)
```

## Scaling Notes

- The app is stateless — scale horizontally by running multiple container instances behind a load balancer.
- No Redis / no BullMQ in this build, so no cross-instance shared state beyond Postgres.
- When you swap in a real auth layer (JWT, OIDC, …), make sure its keys/tokens are shared across all instances.
