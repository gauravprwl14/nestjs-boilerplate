# PLOT.md — Project Vision & Planning

## Vision

Provide a production-ready, AI-native NestJS 11 boilerplate that teams can clone and extend.
The boilerplate demonstrates first-class observability, type-safe configuration, clean error handling,
and a layered architecture that AI coding assistants can navigate efficiently via structured documentation.

---

## Current Milestone: v1.0 — Feature Complete

All planned feature work is done. The codebase is stable and the focus is now on documentation,
test coverage, and developer experience (DX).

---

## Implemented Features

| Area | Status | Notes |
|------|--------|-------|
| Foundation (NestJS 11, Express) | Done | Bootstrapped with graceful shutdown |
| Zod env validation | Done | `src/config/schemas/env.schema.ts` |
| Prisma 7 + PostgreSQL 16 | Done | `@prisma/adapter-pg` driver adapter |
| Redis 7 + BullMQ | Done | Queue module; todo-item status processor |
| JWT Auth (access + refresh rotation) | Done | `src/modules/auth/` |
| API Key Auth | Done | Hashed storage, passport-custom strategy |
| Users module (profile) | Done | SafeUser type; passwordHash never exposed |
| TodoLists CRUD | Done | Soft delete; user-scoped |
| TodoItems CRUD + status transitions | Done | BullMQ job on completion |
| Tags + assign/remove on items | Done | Global tags; join table |
| OpenTelemetry SDK | Done | gRPC exporter; auto-instrumentation |
| Custom logger (AppLogger/Pino) | Done | logEvent, logError, child loggers |
| Telemetry decorators | Done | @Trace, @InstrumentClass, @IncrementCounter, @RecordDuration |
| Exception filters | Done | PrismaExceptionFilter → AllExceptionsFilter |
| Grafana stack | Done | Tempo, Loki, Prometheus, OTel Collector via docker-compose |
| Documentation (Plan 5) | Done | CLAUDE.md, docs/, .claude/ agents & skills |
| Test coverage | Pending | Unit + e2e scaffolding in place |

---

## Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| ORM | Prisma 7 | Type-safe queries, migration tooling, `@prisma/adapter-pg` for native PG driver |
| HTTP adapter | Express | Widest ecosystem, familiar for most teams |
| Queue | BullMQ via Redis | Battle-tested, delayed jobs, retries, priority queues |
| Observability | OpenTelemetry + Grafana | Vendor-neutral, open-source, full traces/logs/metrics pipeline |
| Validation | Zod (env) + class-validator (DTOs) | Zod for strict config; class-validator for HTTP body decoration |
| Error strategy | AppError + ErrorFactory + domain error codes | Consistent error shapes, easy to mock in tests, traceable error source |
| Auth | JWT (access 15m / refresh 7d rotation) + API Key | Covers both user-facing and machine-to-machine access |
| Logger | nestjs-pino (Pino-backed) | Structured JSON logs, low overhead, automatic request correlation |

---

## Next Steps

1. **Test coverage** — Write unit tests for all services and repositories; e2e tests for all 14 API endpoints.
2. **Swagger export** — Run `.claude/skills/generate-swagger.md` to produce `docs/api/swagger.json`.
3. **Postman collection** — Run `.claude/skills/generate-postman.md` from the exported swagger.
4. **CI/CD** — GitHub Actions: lint → type-check → test → build → Docker push.
5. **Helm chart / k8s manifests** — Optional production deployment configuration.
6. **Rate limiting per-user** — Extend ThrottlerModule to use Redis-backed per-user rate limits.
