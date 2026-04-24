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
- [x] TelemetryModule (global, OTel SDK — disabled by default)
- [x] BaseRepository with soft-delete helpers and tx-aware `delegateFor(client)` API
- [x] Prisma schema at `src/database/prisma/schema.prisma`
- [x] Common infrastructure (filters, interceptors, middleware, pipes, decorators)
- [x] Graceful shutdown (`bootstrap/graceful-shutdown.ts`)

### Multi-Tenancy (new)

- [x] `MockAuthMiddleware` resolves `x-user-id` → CLS tuple `{ userId, companyId, userDepartmentIds }`
- [x] Global `AuthContextGuard` (`APP_GUARD`) — requires `companyId` in CLS; `@Public()` opt-out
- [x] Prisma `$extends` tenant-scope extension (`Department`, `UserDepartment`, `Tweet`, `TweetDepartment`)
- [x] Raw-SQL safety: `findTimelineForUser` hard-codes `company_id` in every predicate
- [x] Schema composite FKs `(parentId, companyId) → departments(id, companyId)` and `(tweetId/departmentId, companyId)` on pivots
- [x] Service-layer pre-validation (`findExistingIdsInCompany`) → `VAL0008` on cross-tenant references

### Departments

- [x] `POST /api/v1/departments`
- [x] `GET /api/v1/departments`
- [x] `GET /api/v1/departments/tree`
- [x] Adjacency-list model, unbounded depth
- [x] Pure-function `buildTree()` (unit-tested)

### Tweets / Timeline

- [x] `POST /api/v1/tweets` — content ≤ 280, visibility ∈ `{COMPANY, DEPARTMENTS, DEPARTMENTS_AND_SUBDEPARTMENTS}`
- [x] `GET /api/v1/timeline` — newest-first, default limit 100
- [x] Recursive-CTE timeline query (single round-trip, `UNION` for per-iteration dedup)
- [x] Author self-visibility in timeline (prevents "ghost tweets")

### Error Handling

- [x] `ErrorException` class (extends `Error`) with `definition`, `code`, `statusCode`, `details`, `cause`
- [x] Static helpers: `notFound()`, `validation()`, `validationFromCV()`, `internal()`, `wrap()`
- [x] Domain error constants per file in `src/errors/error-codes/` (`GEN`, `VAL`, `AUT`, `AUZ`, `DAT`, `SRV`)
- [x] New codes: `VAL.DEPARTMENT_IDS_REQUIRED (VAL0007)`, `VAL.DEPARTMENT_NOT_IN_COMPANY (VAL0008)`, `DAT.DEPARTMENT_NOT_FOUND (DAT0009)`, `DAT.COMPANY_NOT_FOUND (DAT0010)`, `AUZ.CROSS_TENANT_ACCESS (AUZ0004)`
- [x] `AllExceptionsFilter` (thin — delegates to `ErrorException.toResponse()`)
- [x] Prisma error handler in filter pipeline
- [x] Cause chain support in responses (non-prod) and logs
- [x] Fallback Express error handler after `app.listen()` for router-layer 404s

### Testing

- [x] Unit tests: `MockAuthMiddleware`, `AuthContextGuard`, tenant-scope extension, CLS, `@ApiEndpoint`
- [x] Unit tests: Users/Companies/Departments/Tweets DbRepository + DbService
- [x] Unit tests: `DepartmentsService`, `TweetsService`
- [x] Integration test: `test/integration/acl-matrix.spec.ts` — 13-case visibility matrix against real Postgres
- [x] E2E test: `test/e2e/tweets.e2e-spec.ts`
- [x] Mock helpers: `test/helpers/factories.ts`, `mock-config.ts`, `mock-prisma.ts`

### Documentation

- [x] `CLAUDE.md` — root AI router (rewritten for pivot)
- [x] `README.md` — multi-tenant approach + ACL + department hierarchy
- [x] `docs/prd/enterprise-twitter-prd.md`
- [x] `docs/architecture/` — high-level, service, database-design, mock-auth-flow
- [x] `docs/diagrams/` — tweets-sequence, error-handling-flow, observability-pipeline
- [x] `docs/guides/` — FOR-Multi-Tenancy, FOR-Tweets, FOR-Departments, FOR-Database-Layer, FOR-Error-Handling, FOR-Observability
- [x] `docs/coding-guidelines/` — all guidelines updated
- [x] `docs/infrastructure/02-environment-configuration.md` — trimmed for the new env schema

### Removed in the pivot

- [x] Auth module (JWT + API Key) — archived docs: `docs/archival/2026-04-17_*`
- [x] Users module (CRUD) — kept only `UsersDbService.findAuthContext` for mock auth
- [x] TodoLists / TodoItems / Tags modules — all aggregates and their DB layers
- [x] Health module (Terminus)
- [x] Queue module (BullMQ + Redis)
- [x] ThrottlerModule (rate limiting)
- [x] `@ApiAuth()` / `@Roles()` decorators and `signature-verification.middleware.ts`

### Observability / Archival (feat/observability branch)

- [x] `ArchivalModule` — `/api/v1/admin/archival` admin endpoints
  - `POST /simulate-rotation` — moves oldest hot orders (>90 days) → warm metadata archive tier
  - `GET /stats` — row counts per storage tier from `orders_recent` and `user_order_index`
  - `GET /database-sizes` — `pg_database_size()` for primary, metadata, and cold archive DB instances
  - `GET /archive-for-year/:year` — look up cold archive config for a given year
- [x] `MockDataModule` — `/api/v1/mock-data` endpoints
  - `GET /status` — data status (row counts, date ranges) across all storage tiers
  - `POST /generate` — trigger data generation if tables are empty; returns seeding instructions if not
- [ ] Wire `ArchivalModule` and `MockDataModule` into `AppModule`
- [ ] Provide `MultiDbService` and `ArchiveRegistryService` in `DatabaseModule`
- [ ] Unit + integration tests for archival and mock-data modules

## Current Focus

Observability + multi-tier archival implementation on `feat/observability` branch.
Core enterprise-twitter assignment endpoints are complete; new archival and
mock-data admin modules are being added.
