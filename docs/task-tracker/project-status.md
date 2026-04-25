# Project Status

Last updated: 2026-04-25

## Milestone Checklist

### Foundation

- [x] NestJS 11 project scaffold with Express adapter
- [x] Zod environment validation (`src/config/schemas/env.schema.ts`) — includes multi-DB + Redis vars
- [x] AppConfigModule (global, Zod-validated, typed `.get` accessor for multi-DB env vars)
- [x] AppLoggerModule (global, Pino-backed, trace-correlated)
- [x] PrismaModule (global, migrations only — runtime uses raw `pg` pools)
- [x] DatabaseModule (global — `MultiDbService`, `ArchiveRegistryService`, `OrdersDbService`, `ArchivalDbService`, `MockDataDbService`)
- [x] TelemetryModule (global, OTel SDK — disabled by default)
- [x] Prisma schema at `src/database/prisma/schema.prisma` (order-management models)
- [x] Common infrastructure (filters, interceptors, middleware, pipes, decorators)
- [x] Graceful shutdown (`bootstrap/graceful-shutdown.ts`)

### Auth & CLS Context

- [x] `MockAuthMiddleware` — reads `x-user-id`, validates positive integer, sets `ClsKey.USER_ID` — no DB lookup
- [x] Global `AuthContextGuard` (`APP_GUARD`) — requires `userId` in CLS; `@Public()` opt-out
- [x] `ClsKey` enum simplified: `REQUEST_ID`, `USER_ID`, `TRACE_ID`, `SPAN_ID`

### Database Layer (Multi-Tier)

- [x] `MultiDbService` — pg.Pool manager: primary (max 20), replica-1/2 (max 15 each), metadata (max 10), cold archive pools (lazily created, max 5)
- [x] `ArchiveRegistryService` — loads `archive_databases` table on startup; year+tier → pg.Pool routing
- [x] `OrdersDbRepository` + `OrdersDbService` — full CRUD + multi-tier order fetching
- [x] `ArchivalDbRepository` + `ArchivalDbService` — stats, database sizes, archive lookup
- [x] `MockDataDbRepository` + `MockDataDbService` — data status across all tiers

### Orders API

- [x] `GET /api/v1/orders/:orderId` — fetch order from correct tier via `user_order_index`
- [x] `GET /api/v1/orders/user/:userId` — paginated user orders across all tiers
- [x] `POST /api/v1/orders` — create order on primary pool; insert `user_order_index` entry

### Archival Module

- [x] `POST /api/v1/admin/archival/simulate-rotation` — moves oldest hot orders (>90 days) → warm metadata archive tier
- [x] `GET /api/v1/admin/archival/stats` — row counts per storage tier
- [x] `GET /api/v1/admin/archival/database-sizes` — `pg_database_size()` for all DB instances
- [x] `GET /api/v1/admin/archival/archive-for-year/:year` — look up cold archive config for a given year

### Mock Data Module

- [x] `GET /api/v1/mock-data/status` — data status (row counts, date ranges) across all storage tiers
- [x] `POST /api/v1/mock-data/generate` — trigger data generation if tables are empty

### Infrastructure

- [x] Docker Compose with 7 PostgreSQL instances (primary + 2 replicas + metadata + 3 cold archives) + Redis
- [x] Init SQL scripts under `init-scripts/` (schema + seed data for all DBs)
- [x] PostgreSQL streaming replication configured via `primary.conf` and `pg_hba.conf`
- [x] k6 load tests: `read-orders.js`, `create-orders.js`, `archival-stats.js`

### Error Handling

- [x] `ErrorException` class (extends `Error`) with `definition`, `code`, `statusCode`, `details`, `cause`
- [x] Static helpers: `notFound()`, `validation()`, `validationFromCV()`, `internal()`, `wrap()`
- [x] Domain error constants in `src/errors/error-codes/` (`GEN`, `VAL`, `AUT`, `AUZ`, `DAT`, `SRV`)
- [x] `AllExceptionsFilter` (thin — delegates to `ErrorException.toResponse()`)
- [x] Prisma error handler in filter pipeline
- [x] Fallback Express error handler after `app.listen()` for router-layer 404s

### Documentation

- [x] `CLAUDE.md` — root AI router (order-management domain)
- [x] `README.md` — order management overview + API reference
- [x] `docs/architecture/` — high-level, service, database-design, mock-auth-flow
- [x] `docs/guides/` — FOR-Multi-Tenancy, FOR-Database-Layer, FOR-Orders, FOR-Error-Handling, FOR-Observability
- [x] `docs/coding-guidelines/` — all guidelines updated for order-management patterns
- [x] `docs/infrastructure/02-environment-configuration.md` — full multi-DB env var reference

### Pending

- [ ] Unit + integration tests for `OrdersService`, `ArchivalService`, `MockDataService`
- [ ] E2E test: `test/e2e/orders.e2e-spec.ts`
- [ ] Redis caching layer (env vars parsed; ioredis not yet integrated)
- [ ] Real auth (JWT) to replace `MockAuthMiddleware`

## Current Focus

Order management system complete on `feat/order-management` branch. `DatabaseModule`
wires all repositories and services. All three feature modules (`OrdersModule`,
`ArchivalModule`, `MockDataModule`) are fully implemented with controllers, services,
and Db repositories. Tests pending.
