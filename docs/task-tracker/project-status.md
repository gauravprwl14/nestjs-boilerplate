# Project Status

Last updated: 2026-04-17

## Milestone Checklist

### Foundation

- [x] NestJS 11 project scaffold with Express adapter
- [x] Zod environment validation (`src/config/schemas/env.schema.ts`)
- [x] AppConfigModule (global, Zod-validated)
- [x] AppLoggerModule (global, Pino-backed, trace-correlated)
- [x] PrismaModule (global, `@prisma/adapter-pg` native driver)
- [x] DatabaseModule (global, per-aggregate DbRepository + DbService, DatabaseService)
- [x] TelemetryModule (global, OTel SDK)
- [x] BaseRepository with soft-delete helpers and tx-aware `delegateFor(client)` API
- [x] Prisma schema relocated to `src/database/prisma/schema.prisma`
- [x] Common infrastructure (filters, interceptors, middleware, pipes, decorators)
- [x] Graceful shutdown (`bootstrap/graceful-shutdown.ts`)

### Authentication

- [x] JWT strategy (access + refresh rotation)
- [x] API Key strategy (hashed, bcrypt comparison)
- [x] Global `JwtAuthGuard` with `@Public()` bypass
- [x] `POST /auth/register`
- [x] `POST /auth/login`
- [x] `POST /auth/refresh`
- [x] `POST /auth/change-password`
- [x] `POST /auth/api-keys` — create
- [x] `GET /auth/api-keys` — list
- [x] `DELETE /auth/api-keys/:id` — revoke

### Users

- [x] `GET /users/me`
- [x] `PATCH /users/me`
- [x] `SafeUser` type (passwordHash excluded)

### Todo Domain

- [x] `POST /todo-lists`
- [x] `GET /todo-lists`
- [x] `GET /todo-lists/:id`
- [x] `PATCH /todo-lists/:id`
- [x] `DELETE /todo-lists/:id` (soft delete)
- [x] `POST /todo-lists/:listId/items`
- [x] `GET /todo-lists/:listId/items` (paginated + filters)
- [x] `GET /todo-items/:id`
- [x] `PATCH /todo-items/:id` (status transitions enforced)
- [x] `DELETE /todo-items/:id` (soft delete)
- [x] `POST /tags`
- [x] `GET /tags`
- [x] `POST /todo-items/:id/tags/:tagId`
- [x] `DELETE /todo-items/:id/tags/:tagId`
- [x] BullMQ processor for todo-item-completed event

### Telemetry & Observability

- [x] OpenTelemetry SDK init (`src/telemetry/otel-sdk.ts`)
- [x] `@Trace()` decorator
- [x] `@InstrumentClass()` decorator
- [x] `@IncrementCounter()` decorator
- [x] `@RecordDuration()` decorator
- [x] `TelemetryService.addSpanAttributes()`
- [x] Grafana Compose stack (Tempo, Loki, Prometheus, OTel Collector)
- [x] Pre-provisioned Grafana datasources

### Error Handling

- [x] `ErrorException` class (extends `Error`) with `definition`, `code`, `statusCode`, `details`, `cause`
- [x] Static helpers: `notFound()`, `validation()`, `validationFromCV()`, `internal()`, `wrap()`
- [x] Domain error constants per file in `src/errors/error-codes/` (`GEN`, `VAL`, `AUT`, `AUZ`, `DAT`, `SRV`)
- [x] `AllExceptionsFilter` (thin — delegates to `ErrorException.toResponse()`)
- [x] Prisma error handler in filter pipeline (P2002, P2003, P2011, P2025, P2000 mapped; cause preserved)
- [x] Cause chain support in responses (non-prod) and logs

### Documentation (Plan 5)

- [x] `CLAUDE.md` — root AI router
- [x] `PLOT.md` — project vision and planning
- [x] `docs/CONTEXT.md` + all subfolder CONTEXT.md files
- [x] `docs/prd/todo-app-prd.md`
- [x] `docs/architecture/` (4 files)
- [x] `docs/diagrams/` (4 files)
- [x] `docs/coding-guidelines/` (11 files)
- [x] `docs/infrastructure/` (4 files)
- [x] `docs/plans/template.md`
- [x] `docs/assumptions/technical-assumptions.md`
- [x] `docs/guides/` (4 FOR-\*.md files)
- [x] `.claude/` (settings, agents, skills)

### Testing

- [ ] Unit tests for `AuthService`
- [ ] Unit tests for `TodoListsService`
- [ ] Unit tests for `TodoItemsService`
- [ ] Unit tests for `TagsService`
- [ ] Unit tests for `AllExceptionsFilter`
- [ ] Unit tests for `handlePrismaError`
- [ ] E2E tests for all 24 endpoints
- [ ] Test helpers: `createPrismaMock()`, mock factories for all entities
- [ ] CI pipeline (GitHub Actions: lint → type-check → test → build)

### Database Layer Refactor (branch: database-layer-refactor)

- [x] Move Prisma schema to `src/database/prisma/`
- [x] Relocate `BaseRepository` to `src/database/base.repository.ts`; tx-aware `delegateFor(client)` API
- [x] Scaffold `DatabaseService` + `DatabaseModule` (`@Global()`)
- [x] Migrate users aggregate → `UsersDbRepository` + `UsersDbService`
- [x] Migrate auth-credentials aggregate → `AuthCredentialsDbRepository` + `AuthCredentialsDbService`
- [x] Migrate todo-lists aggregate → `TodoListsDbRepository` + `TodoListsDbService`
- [ ] Migrate todo-items aggregate → `TodoItemsDbRepository` + `TodoItemsDbService`
- [ ] Migrate tags aggregate
- [ ] Wrap `AuthService.register` in `runInTransaction` + e2e rollback test
- [ ] Cleanup + doc sync

## Current Focus

Database layer refactor — migrating remaining aggregates (todo-items, tags) and adding transaction coverage.
