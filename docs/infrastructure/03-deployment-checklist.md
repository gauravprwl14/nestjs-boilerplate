# 03 — Deployment Checklist

Complete all items before deploying to a new environment.

## Pre-Deploy: Code & Configuration

- [ ] All environment variables in `02-environment-configuration.md` are set for the target environment
- [ ] `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `API_KEY_ENCRYPTION_SECRET` are ≥ 32 characters and randomly generated
- [ ] `DATABASE_URL` points to the correct database (not dev/test)
- [ ] `NODE_ENV=production`
- [ ] `LOG_LEVEL=info` (not `debug` or `trace`)
- [ ] `OTEL_ENABLED=true` and `OTEL_EXPORTER_OTLP_ENDPOINT` is set (if using observability stack)
- [ ] `CORS_ORIGINS` is set to specific allowed origins (not `*`)
- [ ] `THROTTLE_TTL` and `THROTTLE_LIMIT` are tuned for expected traffic

## Pre-Deploy: Database

- [ ] Database is accessible from the app tier
- [ ] Migrations are reviewed for backward compatibility (no breaking column drops)
- [ ] `npm run prisma:migrate:deploy` has been tested in staging first
- [ ] Database backups are confirmed before running migrations on production
- [ ] Connection pool settings are appropriate for expected concurrency

## Pre-Deploy: Build

```bash
# 1. Type check
npm run type:check

# 2. Lint
npm run lint

# 3. Tests pass
npm run test
npm run test:e2e

# 4. Build succeeds
npm run build
```

## Deploy Steps

```bash
# 1. Pull latest image / deploy new container
docker pull <registry>/ai-native-nestjs-backend:<tag>

# 2. Run migrations (before starting new app instances)
docker run --env-file .env.production <image> npm run prisma:migrate:deploy

# 3. Start new app instances
docker compose -f docker-compose.prod.yml up -d app

# 4. Verify health check
curl http://<host>:3000/api/v1/health
```

## Post-Deploy Verification

- [ ] `GET /api/v1/health` returns `200 { status: 'ok' }`
- [ ] `POST /api/v1/auth/login` returns `200` with a valid token
- [ ] Grafana shows incoming traces (if OTel enabled)
- [ ] Logs appear in Loki with correct `APP_NAME` service label
- [ ] Error rate in Prometheus is `0` after smoke test

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
- Session state is stored in JWT tokens (stateless) and Redis (BullMQ queues).
- Ensure all instances share the same `JWT_*` secrets — otherwise tokens signed on one instance won't verify on another.
- Redis must be accessible from all app instances.
