# Order Management System

A NestJS 11 + raw pg + PostgreSQL backend for the e-commerce order archival
system described in `Question-2.md`. Multi-tier storage (Hot/Warm/Cold) across
7 Postgres instances with read replicas and realistic 3M-order dataset.

---

## Table of Contents

- [Order Management System](#order-management-system)
  - [Table of Contents](#table-of-contents)
  - [Quick Start](#quick-start)
  - [API](#api)
    - [Endpoints](#endpoints)
    - [Response envelope](#response-envelope)
  - [Observability](#observability)
  - [Design Decisions](#design-decisions)
  - [Tech Stack](#tech-stack)
  - [Project Layout](#project-layout)

---

## Quick Start

```bash
# 1. Clone
git clone git@github.com:stmn-gcc-hiring/stmn-backend-test-gauravP.git
cd stmn-backend-test-gauravP

# 2. Start all services (app + 7 Postgres instances + Redis + observability)
podman-compose up -d
```

- API: <http://localhost:3000>
- Swagger: <http://localhost:3000/docs>
- Grafana: <http://localhost:3001> (anonymous admin)

> **Databases seed automatically on first start (~5 min for 3M orders)**
> All data is inserted via Postgres `generate_series` SQL — no app-level loop.
> Subsequent starts are instant (volumes persist).

```bash
# 3. Make a request (userId is any positive integer 1–10000)
curl -H "x-user-id: 42" http://localhost:3000/api/v1/orders/user/42

# 4. Run tests
npm test            # unit + integration
npm run test:e2e    # HTTP round-trip
npm run test:cov    # coverage

# 5. Run k6 load tests (requires k6 installed)
k6 run test/k6/read-orders.js
k6 run test/k6/create-orders.js
k6 run test/k6/archival-stats.js
```

---

## API

### Endpoints

| Method | Path                                   | Auth required | Purpose                                           |
| ------ | -------------------------------------- | ------------- | ------------------------------------------------- |
| GET    | `/api/v1/orders/user/:userId`          | Yes           | Paginated orders for a user — spans Hot/Warm/Cold |
| GET    | `/api/v1/orders/:orderId`              | Yes           | Single order by id (routed to correct tier)       |
| POST   | `/api/v1/orders`                       | Yes           | Create a new order (writes to primary/hot tier)   |
| GET    | `/admin/archival/stats`                | No            | Archival statistics across all tiers              |
| GET    | `/admin/archival/database-sizes`       | No            | Size and row counts per database                  |
| GET    | `/admin/archival/archive-for-year/:yr` | No            | Archive DB config for a given year                |
| POST   | `/admin/archival/simulate-rotation`    | No            | Simulate partition rotation (moves hot→warm)      |
| GET    | `/mock-data/status`                    | No            | Seeding status and tier row counts                |
| POST   | `/mock-data/generate`                  | No            | Trigger on-demand mock data generation            |

Protected routes require `x-user-id: <positive integer>` header.
Full OpenAPI docs: <http://localhost:3000/docs>

### Response envelope

Every response (success or error) is wrapped by
`src/common/interceptors/transform.interceptor.ts` /
`src/common/filters/all-exceptions.filter.ts` into a standard shape so the
client never has to special-case per-route parsing.

**Success**

```jsonc
{
  "success": true,
  "data": <T>,               // route-specific payload
  "meta": { ... },            // only present on paginated routes
  "requestId": "req_01HXYZ…", // echoed from x-request-id, generated if absent
  "traceId": "4bf92f3577b…",  // OTel trace id when tracing is enabled
  "timestamp": "2026-04-17T10:15:30.123Z"
}
```

**Error**

```jsonc
{
  "success": false,
  "errors": [
    {
      "code": "VAL0001",          // domain-prefixed code
      "message": "Validation failed",
      "errorType": "VALIDATION",
      "errorCategory": "CLIENT",
      "retryable": false,
      "details": [...],            // per-field validation issues (optional)
      "cause": [...]               // cause chain — non-production only
    }
  ],
  "requestId": "req_01HXYZ…",
  "traceId": "4bf92f3577b…",
  "timestamp": "2026-04-17T10:15:30.123Z"
}
```

### Sample success responses

**`POST /api/v1/tweets` → `201 Created`**

Request:

```bash
curl -H "x-user-id: <ALICE>" -H "Content-Type: application/json" \
     -X POST http://localhost:3000/api/v1/tweets \
     -d '{"content":"hello team","visibility":"COMPANY"}'
```

Response:

```json
{
  "success": true,
  "data": {
    "id": "3b1f4a2d-6c7e-4a01-9f2c-7a1a8a3b2c11",
    "companyId": "a6b21e0f-5e4a-4b3d-9a11-0c0b2a8e4f71",
    "authorId": "b5c32f1e-7d8a-4b02-0e13-1b2c3d4e5f61",
    "content": "hello team",
    "visibility": "COMPANY",
    "createdAt": "2026-04-17T10:15:30.123Z"
  },
  "requestId": "req_01HXYZABC",
  "timestamp": "2026-04-17T10:15:30.124Z"
}
```

**`GET /api/v1/timeline` → `200 OK`**

```json
{
  "success": true,
  "data": [
    {
      "id": "3b1f4a2d-6c7e-4a01-9f2c-7a1a8a3b2c11",
      "authorId": "b5c32f1e-7d8a-4b02-0e13-1b2c3d4e5f61",
      "content": "hello team",
      "visibility": "COMPANY",
      "createdAt": "2026-04-17T10:15:30.123Z"
    }
  ],
  "requestId": "req_01HXYZABC",
  "timestamp": "2026-04-17T10:15:30.400Z"
}
```

### Sample error responses

**`401 Unauthorized` — missing or unknown `x-user-id`** (`AUT0001`)

```json
{
  "success": false,
  "errors": [
    {
      "code": "AUT0001",
      "message": "Authentication required",
      "errorType": "AUTHENTICATION",
      "errorCategory": "CLIENT",
      "retryable": false
    }
  ],
  "requestId": "req_01HXYZABC",
  "timestamp": "2026-04-17T10:15:30.124Z"
}
```

**`400 Bad Request` — Zod validation failure on `POST /tweets`** (`VAL0001`)

Request body: `{ "content": "", "visibility": "COMPANY" }`

```json
{
  "success": false,
  "errors": [
    {
      "code": "VAL0001",
      "message": "Validation failed",
      "errorType": "VALIDATION",
      "errorCategory": "CLIENT",
      "retryable": false,
      "details": [{ "field": "content", "message": "String must contain at least 1 character(s)" }]
    }
  ],
  "requestId": "req_01HXYZABC",
  "timestamp": "2026-04-17T10:15:30.124Z"
}
```

**`422 Unprocessable Entity` — cross-tenant / out-of-company department id** (`VAL0008`)

```json
{
  "success": false,
  "errors": [
    {
      "code": "VAL0008",
      "message": "Referenced department ids include values outside this company.",
      "errorType": "VALIDATION",
      "errorCategory": "CLIENT",
      "retryable": false
    }
  ],
  "requestId": "req_01HXYZABC",
  "timestamp": "2026-04-17T10:15:30.124Z"
}
```

**`404 Not Found` — parent department does not exist** (`DAT0009`)

```json
{
  "success": false,
  "errors": [
    {
      "code": "DAT0009",
      "message": "Department not found",
      "errorType": "DATABASE",
      "errorCategory": "CLIENT",
      "retryable": false
    }
  ],
  "requestId": "req_01HXYZABC",
  "timestamp": "2026-04-17T10:15:30.124Z"
}
```

> The exact `errorType` / `errorCategory` / HTTP status values for each code
> are the single source of truth in
> `src/errors/error-codes/*.ts`. The filter (`all-exceptions.filter.ts`) just
> reads them; it never hard-codes mappings.

---

## Observability

Grafana at <http://localhost:3001> (anonymous admin) — pre-built dashboards for:

- Request rate and p95/p99 latency per endpoint
- Tier-routing breakdown (Hot vs Warm vs Cold queries)
- Replica lag (`pg_last_xact_replay_timestamp`)
- Redis hit/miss ratio

OpenTelemetry is **enabled by default** in the container stack (`OTEL_ENABLED=true`).
Set `OTEL_ENABLED=false` in `.env` for local development without the collector.

---

## Design Decisions

### Multi-Tier Storage

Orders are stored across three tiers depending on age:

| Tier          | Storage                  | Age             | Contents                     |
| ------------- | ------------------------ | --------------- | ---------------------------- |
| Hot (tier 2)  | `primary-db`             | last 90 days    | Full orders + items          |
| Warm (tier 3) | `metadata-archive-db`    | 90 days – 5 yrs | Metadata only (no items)     |
| Cold (tier 4) | `archive-2023/2024/2025` | Older           | Full archived orders + items |

Reads always start with a `user_order_index` lookup on the primary, then
fan out in parallel to whichever tiers are needed. P95 read latency stays
under 200ms even when crossing all three tiers simultaneously.

### Read Replica Routing

Writes go to the primary pool. Reads are distributed across two replicas
via a simple atomic round-robin counter in `MultiDbService.getReadPool()`.
Replica lag is typically sub-millisecond on the local Docker network.

### Auth

`x-user-id` is validated as a positive integer in `MockAuthMiddleware` —
no database lookup. The value is stored in CLS (`ClsKey.USER_ID`) and
consumed by services and the `AuthContextGuard`.

---

## Out of Scope

Features intentionally left out of this submission. Each item links to its
section in [`docs/assumptions/out-of-scope.md`](docs/assumptions/out-of-scope.md),
where the reasoning and a sketch of how it would be added are documented.

- [Timeline pagination](docs/assumptions/out-of-scope.md#timeline-pagination)
  — default limit 100; cursor pagination sketched.
- [Tweet update, delete, replies, likes, search](docs/assumptions/out-of-scope.md#tweet-update-delete-replies-likes-search)
  — not in the spec; would need their own controllers and indexes.
- [Registration, login, JWT, API keys](docs/assumptions/out-of-scope.md#registration-login-jwt-api-keys)
  — stripped in favour of mock auth; swap is a single middleware change.
- [Department update and delete](docs/assumptions/out-of-scope.md#department-update-and-delete)
  — only create + list are exposed.
- [Observability](docs/assumptions/out-of-scope.md#observability)
  — OTel scaffolding present, disabled by `OTEL_ENABLED=false`.
- [Rate limiting, request size limits, CORS tuning](docs/assumptions/out-of-scope.md#rate-limiting-request-size-limits-cors-tuning)
  — stock NestJS defaults; production would tighten all three.

---

## Tech Stack

| Layer             | Tech                                                                                                                  | Version         | Why it's in the stack                                                                                                                                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework         | **NestJS**                                                                                                            | 11              | Modular DI, decorators, first-class middleware/guard/interceptor model.                                                                                                                                                                              |
| HTTP platform     | **Express** (`@nestjs/platform-express`)                                                                              | 5               | Default Nest adapter; well-understood middleware ecosystem.                                                                                                                                                                                          |
| Language          | **TypeScript**                                                                                                        | 6               | Type safety across controllers, services, and Prisma-generated types.                                                                                                                                                                                |
| Compiler          | **SWC** (`@swc/core`, `nest-cli.json` → `builder: "swc"`)                                                             | 1.x             | ~10× faster builds than `tsc`; `tsc --noEmit` still runs in CI for type-checking (`npm run type:check`).                                                                                                                                             |
| API docs          | **@nestjs/swagger**                                                                                                   | 11              | OpenAPI 3 served at `/docs`.                                                                                                                                                                                                                         |
| Database          | **PostgreSQL**                                                                                                        | 16              | Single shared store; recursive CTEs and composite FKs are first-class.                                                                                                                                                                               |
| ORM               | **Prisma** + **`@prisma/adapter-pg`**                                                                                 | 7               | Driver-adapter mode → Prisma ergonomics + native `pg` driver for pool/raw-SQL control.                                                                                                                                                               |
| Tenant context    | **nestjs-cls**                                                                                                        | 6               | AsyncLocalStorage request context — propagates `userId`, `companyId`, `userDepartmentIds` through every await.                                                                                                                                       |
| Validation        | **Zod**                                                                                                               | 4               | Schema-driven DTOs + runtime validation via a custom `ZodValidationPipe`.                                                                                                                                                                            |
| Logging           | **Pino** + **nestjs-pino**                                                                                            | 10 / 4          | Structured JSON logs, request-correlated, low overhead.                                                                                                                                                                                              |
| Tracing & metrics | **OpenTelemetry** — `sdk-node`, auto-instrumentations (HTTP, Express, Nest), OTLP gRPC exporters for traces & metrics | 0.214.x / 2.6.x | Disabled by default (`OTEL_ENABLED=false`); flip on for staging/prod. See [`docs/guides/FOR-Observability.md`](docs/guides/FOR-Observability.md) + [`docs/infrastructure/04-grafana-stack-setup.md`](docs/infrastructure/04-grafana-stack-setup.md). |
| HTTP hardening    | **Helmet**                                                                                                            | 8               | Standard security headers.                                                                                                                                                                                                                           |
| Testing           | **Jest** + **supertest**                                                                                              | 30 / 7          | Unit, integration (real Postgres), and e2e suites.                                                                                                                                                                                                   |
| Test fixtures     | **@faker-js/faker**                                                                                                   | 10              | Deterministic seed/fixture data.                                                                                                                                                                                                                     |
| Config            | **@nestjs/config** + **Zod**                                                                                          | 4 / 4           | Schema-validated env at boot — fails fast on bad configuration.                                                                                                                                                                                      |
| Lint / format     | **ESLint** + **Prettier**                                                                                             | 10 / 3          | Lint and format on save.                                                                                                                                                                                                                             |
| Commit hygiene    | **Husky** + **lint-staged** + **Commitlint**                                                                          | 9 / 16 / 20     | Pre-commit checks and conventional-commit enforcement.                                                                                                                                                                                               |

---

## Project Layout

```
src/
├── app.module.ts                              # module wiring + global middleware/guard
├── main.ts                                    # bootstrap, Swagger, pipes, filters
├── common/
│   ├── middleware/mock-auth.middleware.ts     # HTTP gate: x-user-id (positive int) → CLS
│   └── guards/auth-context.guard.ts           # Fail-fast: userId must be in CLS
├── database/
│   ├── multi-db.service.ts                    # @Global pg Pool manager (primary/replicas/archives)
│   ├── database.module.ts                     # Registers MultiDbService
│   └── interfaces/index.ts                    # PoolConfig, OrderRow, DbTier, …
├── modules/
│   ├── orders/                                # GET/POST /api/v1/orders — multi-tier routing
│   ├── archival/                              # GET /admin/archival/* — stats, sizes, registry
│   └── mock-data/                             # GET/POST /mock-data — seeding controls
├── errors/error-codes/                        # AUT, VAL, DAT, SRV domain codes
└── …

prisma/
└── seed.ts                                    # generate_series SQL seed — ~3M orders, ~850MB

test/
├── unit/…                                     # unit specs
├── integration/multi-tier-routing.spec.ts     # tier routing against real Postgres
├── e2e/orders.e2e-spec.ts                     # HTTP happy-path
└── k6/
    ├── read-orders.js                         # 20→100 VUs, 3 min; p95<200ms
    ├── create-orders.js                       # 10→20 VUs, 2 min; p95<300ms
    └── archival-stats.js                      # 5 VUs, 1.5 min; p95<1000ms

docs/
├── CONTEXT.md                                 # top-level router
├── architecture/                              # high-level + DB + service diagrams
├── coding-guidelines/                         # conventions, DI, error-handling, testing
├── infrastructure/                            # docker, env, deployment, grafana
└── superpowers/plans/                         # implementation plans
```
