# Enterprise Twitter — Multi-Tenant Backend

A NestJS 11 + Prisma 7 + PostgreSQL backend for the take-home assignment in
`QUESTION.md`. One service, many companies, tweets with three levels of
per-department visibility.

---

## Table of Contents

- [How to Run](#how-to-run)
- [API](#api)
  - [Response envelope](#response-envelope)
  - [Sample success responses](#sample-success-responses)
  - [Sample error responses](#sample-error-responses)
- [Design Decisions](#design-decisions)
  - [Multi-tenant Approach](#multi-tenant-approach)
  - [ACL Logic](#acl-logic)
  - [Department Hierarchy Handling](#department-hierarchy-handling)
- [Further Reading](#further-reading) — architecture, sequence diagrams, guides
- [Out of Scope](#out-of-scope)
- [FAQ](#faq)
- [Tech Stack](#tech-stack)
- [Project Layout](#project-layout)

---

## How to Run

Pick one path. The first is the zero-deps happy path.

### A. Everything in containers (recommended)

Needs only Podman (or Docker). App + Postgres + observability boot together,
with migrations and seed auto-applied (idempotent).

```bash
podman compose up -d                         # or: docker compose up -d
```

- API: <http://localhost:3000> · Swagger at `/docs`
- Grafana: <http://localhost:3001> (anonymous admin)

### B. App on host, Postgres in container (fastest dev loop)

```bash
podman compose up -d postgres                 # DB only, mapped to host :5433
export DATABASE_URL="postgresql://postgres:postgres@localhost:5433/enterprise_twitter_dev?schema=public"
npm install
npm run start:dev:seeded                      # migrate + seed + start:dev
```

### C. Everything on host (no containers)

Requires a local **Postgres 16** with an empty `enterprise_twitter_dev` database.

```bash
export DATABASE_URL="postgresql://<user>:<pwd>@localhost:5432/enterprise_twitter_dev?schema=public"
npm install
npm run start:dev:seeded
```

More detail (individual services, observability-only boot, re-seed):
[`docs/coding-guidelines/09-development-workflow.md`](docs/coding-guidelines/09-development-workflow.md).

### Making a request

The seed prints every user UUID on first run. To fetch one anytime:

```bash
podman compose exec postgres \
  psql -U postgres -d enterprise_twitter_dev -c 'SELECT id, email FROM users;'
```

Then set `x-user-id`:

```bash
curl -H "x-user-id: <ALICE>" http://localhost:3000/api/v1/timeline

curl -H "x-user-id: <ALICE>" -H "Content-Type: application/json" \
     -X POST http://localhost:3000/api/v1/tweets \
     -d '{"content":"hello","visibility":"COMPANY"}'
```

Missing or unknown header → `401 AUT0001`.

### Tests

```bash
npm test                  # unit + ACL-matrix integration
npm run test:e2e          # HTTP round-trip
npm run test:cov          # with coverage (≥ 70% global, ≥ 80% services)
```

---

## API

| Method | Path                       | Purpose                                                                                                                                                |
| ------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST   | `/api/v1/tweets`           | Create a tweet (content ≤ 280 chars; visibility ∈ {COMPANY, DEPARTMENTS, DEPARTMENTS_AND_SUBDEPARTMENTS}; `departmentIds` required for the latter two) |
| GET    | `/api/v1/timeline`         | Tweets visible to the caller, newest first, up to 100 rows                                                                                             |
| POST   | `/api/v1/departments`      | Create a department (optional `parentId`, must be same-company)                                                                                        |
| GET    | `/api/v1/departments`      | Flat list of departments in the caller's company                                                                                                       |
| GET    | `/api/v1/departments/tree` | Same list, nested by `parentId`                                                                                                                        |

All routes require the `x-user-id` header. Full OpenAPI docs are live at
`http://localhost:3000/docs` once the app is running.

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

## Design Decisions

### Multi-tenant Approach

One shared database, one `companyId` column on every tenant-scoped table.
That is the simplest shape that still scales defensibly, and it fit the
time budget.

Isolation is enforced at **five independent layers**, so no single bug can
leak data across tenants:

1. **HTTP gate** — `MockAuthMiddleware`
   (`src/common/middleware/mock-auth.middleware.ts`) reads `x-user-id`,
   loads the user's company and direct departments, and publishes them into
   CLS (AsyncLocalStorage). Missing or unknown id → `401`.
2. **Fail-fast guard** — `AuthContextGuard`
   (`src/common/guards/auth-context.guard.ts`) is registered as
   `APP_GUARD`. If `companyId` is not in CLS (e.g. a route skipped the
   middleware), the guard rejects the request before any query runs.
   `@Public()` routes bypass it.
3. **ORM guard** — a Prisma `$extends` extension
   (`src/database/extensions/tenant-scope.extension.ts`) applies to every
   operation on `Department`, `UserDepartment`, `Tweet`, and
   `TweetDepartment`. Reads get `where: { companyId }` injected. Writes are
   rejected if `data.companyId` disagrees with CLS, or is omitted.
4. **Service pre-validation** — services look up any referenced ids inside
   the caller's tenant _before_ a write. A cross-tenant `departmentId` is
   surfaced as `VAL0008 DEPARTMENT_NOT_IN_COMPANY` instead of a raw FK
   error later.
5. **Schema-level composite FKs** — `(parentId, companyId)` on the
   `departments` self-reference and `(tweetId, companyId)` /
   `(departmentId, companyId)` on `TweetDepartment`. Even if every layer
   above failed, Postgres refuses a cross-tenant row.

Prisma's `$extends` does **not** cover raw SQL or nested `connect` writes,
so two things are done by hand:

- The only raw query, `findTimelineForUser`
  (`src/database/tweets/tweets.db-repository.ts`), hard-codes
  `company_id = ${companyId}` as the first WHERE predicate and threads
  `companyId` into every sub-CTE.
- `TweetsService.create` (`src/modules/tweets/tweets.service.ts`) never
  uses nested `connect` into tenant-scoped relations. It resolves target
  ids via `findExistingIdsInCompany` (cross-tenant rows silently drop),
  fails with `VAL0008` on a length mismatch, then writes via a flat
  `createMany` with an explicit `companyId` on every row.

More detail: `docs/guides/FOR-Multi-Tenancy.md`.

### ACL Logic

A user sees a tweet if, and only if:

- It is in the **same company**, and
- Any one of these is true:
  - The user is the **author** (authors always see their own posts — a
    CEO posting to Engineering should still see it in their own
    timeline).
  - `visibility = COMPANY`.
  - `visibility = DEPARTMENTS` and at least one target department is in
    the user's **direct** memberships.
  - `visibility = DEPARTMENTS_AND_SUBDEPARTMENTS` and at least one target
    department is an **ancestor-or-equal** of one of the user's
    departments.

All four branches are evaluated in **one SQL query** — no N+1, no tree
walking in app code. The 13 numbered cases (plus one sanity counter-case)
of the visibility matrix are exercised against a real Postgres in
`test/integration/acl-matrix.spec.ts`.

More detail: `docs/guides/FOR-Tweets.md`, `docs/diagrams/tweets-sequence.md`.

### Department Hierarchy Handling

Departments use an **adjacency list**: each row has an optional `parentId`
pointing at its parent. It is the simplest model that still supports
arbitrary depth.

To read the tree efficiently, the timeline query uses a Postgres
`WITH RECURSIVE` CTE. It climbs from each of the user's direct
departments up through parents in a single pass, so
`DEPARTMENTS_AND_SUBDEPARTMENTS` visibility resolves in one round-trip:

```sql
WITH RECURSIVE
  user_direct_depts AS (
    SELECT department_id AS id
    FROM user_departments
    WHERE user_id = $user AND company_id = $company
  ),
  user_dept_ancestors(id, parent_id) AS (
    SELECT d.id, d.parent_id FROM departments d
    WHERE d.id IN (SELECT id FROM user_direct_depts)
      AND d.company_id = $company
    UNION
    SELECT p.id, p.parent_id FROM departments p
    INNER JOIN user_dept_ancestors uda ON p.id = uda.parent_id
    WHERE p.company_id = $company
  )
SELECT … FROM tweets WHERE …   -- visibility branches use both CTEs
```

Every CTE and the outer `SELECT` filter on `company_id = $company`. With
the composite FK on `departments(parentId, companyId)`, a tree cannot
cross tenants even if the create path tried.

More detail on the SQL choices (including why `UNION` and not `UNION ALL`):
`docs/guides/FOR-Tweets.md`, `docs/architecture/database-design.md`.

---

## Further Reading

The `docs/` tree is the deep-dive layer. Start at
[`docs/CONTEXT.md`](docs/CONTEXT.md) for the top-level router, or jump
straight to one of these high-value entry points.

**Architecture (how the pieces fit together)**

| Topic                                                  | File                                                                                           |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Whole-system picture, request lifecycle                | [`docs/architecture/high-level-architecture.md`](docs/architecture/high-level-architecture.md) |
| Prisma schema, composite FKs, tenancy columns          | [`docs/architecture/database-design.md`](docs/architecture/database-design.md)                 |
| How `x-user-id` becomes CLS tenant context             | [`docs/architecture/mock-auth-flow.md`](docs/architecture/mock-auth-flow.md)                   |
| Controller → Service → DbService → Repository layering | [`docs/architecture/service-architecture.md`](docs/architecture/service-architecture.md)       |

**Sequence & flow diagrams (Mermaid)**

| Diagram                                          | File                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Tweet create + timeline request flow             | [`docs/diagrams/tweets-sequence.md`](docs/diagrams/tweets-sequence.md)               |
| Error-handling pipeline (throw → filter → wire)  | [`docs/diagrams/error-handling-flow.md`](docs/diagrams/error-handling-flow.md)       |
| Observability pipeline (logs + OTel + collector) | [`docs/diagrams/observability-pipeline.md`](docs/diagrams/observability-pipeline.md) |

**Topic guides (task-oriented)**

| I want to…                             | File                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------ |
| Understand tenant isolation end-to-end | [`docs/guides/FOR-Multi-Tenancy.md`](docs/guides/FOR-Multi-Tenancy.md)   |
| Work on the tweet / timeline path      | [`docs/guides/FOR-Tweets.md`](docs/guides/FOR-Tweets.md)                 |
| Work on departments or the hierarchy   | [`docs/guides/FOR-Departments.md`](docs/guides/FOR-Departments.md)       |
| Add a DbService/DbRepository           | [`docs/guides/FOR-Database-Layer.md`](docs/guides/FOR-Database-Layer.md) |
| Add or fix an error code               | [`docs/guides/FOR-Error-Handling.md`](docs/guides/FOR-Error-Handling.md) |
| Wire up logs / traces / metrics        | [`docs/guides/FOR-Observability.md`](docs/guides/FOR-Observability.md)   |

**Product & infrastructure**

| Topic                                      | File                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Product requirements (what we're building) | [`docs/prd/enterprise-twitter-prd.md`](docs/prd/enterprise-twitter-prd.md)                                   |
| Docker Compose / local dev                 | [`docs/infrastructure/01-docker-setup.md`](docs/infrastructure/01-docker-setup.md)                           |
| Environment variables                      | [`docs/infrastructure/02-environment-configuration.md`](docs/infrastructure/02-environment-configuration.md) |
| Deployment checklist                       | [`docs/infrastructure/03-deployment-checklist.md`](docs/infrastructure/03-deployment-checklist.md)           |
| Grafana / OTel collector stack             | [`docs/infrastructure/04-grafana-stack-setup.md`](docs/infrastructure/04-grafana-stack-setup.md)             |
| Technical assumptions behind the design    | [`docs/assumptions/technical-assumptions.md`](docs/assumptions/technical-assumptions.md)                     |

**Coding guidelines** — conventions, DI, error handling, testing — live under
[`docs/coding-guidelines/`](docs/coding-guidelines/) (11 numbered files,
indexed by [`docs/coding-guidelines/CONTEXT.md`](docs/coding-guidelines/CONTEXT.md)).

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

## FAQ

**How do I get a user id to use as `x-user-id`?**

The seed prints every user's UUID to stdout on first run. If the DB is already
seeded (the seed is idempotent — see `prisma/seed.ts:18-22`), query the `users`
table directly:

```bash
podman compose exec postgres \
  psql -U postgres -d enterprise_twitter_dev -c 'SELECT id, name, email FROM users;'
```

Or re-run the seed printer only (safe; no-ops if data exists):

```bash
npm run prisma:seed
```

Or open Prisma Studio:

```bash
npm run prisma:studio
```

> Tables are snake-plural (`users`, `companies`, `departments`, `tweets`, …) via
> Prisma `@@map` directives — `SELECT … FROM "user"` will fail with
> `relation "user" does not exist`.

**Why does `SELECT … FROM "user"` fail?**

See above — every model in `src/database/prisma/schema.prisma` is mapped to a
plural snake_case table name. Use `users`, not `"user"`.

**I get `401 AUT0001` on every request.**

The `x-user-id` header is missing or the UUID isn't in the `users` table. Grab a
valid id via the command above and pass it on every request:

```bash
curl -H "x-user-id: <UUID>" http://localhost:3000/api/v1/timeline
```

Swagger (`/docs`) and health probes are `@Public()` and do not need the header.

**How do I force a re-seed?**

The seed short-circuits if any company row exists. Truncate first, then re-run:

```bash
podman compose exec postgres psql -U postgres -d enterprise_twitter_dev -c \
  'TRUNCATE companies, departments, users, user_departments, tweets, tweet_departments CASCADE;'
npm run prisma:seed
```

Or wipe and re-migrate the whole schema (drops all data):

```bash
npm run prisma:migrate:reset
```

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
│   ├── middleware/mock-auth.middleware.ts     # ① HTTP gate: x-user-id → CLS
│   └── guards/auth-context.guard.ts           # ② Fail-fast: CLS companyId must be set
├── database/
│   ├── prisma.service.ts                      # Prisma client + tenant-scoped extension wiring
│   ├── extensions/tenant-scope.extension.ts   # ③ ORM guard: inject/assert companyId
│   ├── prisma/schema.prisma                   # models + composite FKs
│   ├── companies/
│   ├── departments/
│   ├── tweets/                                # incl. raw-SQL timeline query
│   └── users/                                 # minimal: only findAuthContext for mock auth
├── modules/
│   ├── departments/                           # POST /departments, GET /departments, /tree
│   └── tweets/                                # POST /tweets, GET /timeline
├── errors/error-codes/                        # AUZ.CROSS_TENANT_ACCESS,
│                                              # DAT.DEPARTMENT_NOT_FOUND / COMPANY_NOT_FOUND,
│                                              # VAL.DEPARTMENT_IDS_REQUIRED / DEPARTMENT_NOT_IN_COMPANY
└── …

prisma/
└── seed.ts                                    # 3 companies, up-to-4-level dept trees, 16 users + sample tweets

test/
├── unit/…                                     # co-located unit specs
├── integration/acl-matrix.spec.ts             # ★ the visibility matrix — real Postgres
└── e2e/tweets.e2e-spec.ts                     # HTTP happy-path

docs/
├── CONTEXT.md                                 # top-level router
├── api/                                       # OpenAPI / route references
├── architecture/                              # high-level + DB + mock-auth + service diagrams
├── assumptions/                               # technical-assumptions.md, out-of-scope.md
├── coding-guidelines/                         # conventions, DI, error-handling, testing
├── diagrams/                                  # Mermaid sequence / flow diagrams
├── guides/                                    # FOR-Multi-Tenancy, FOR-Tweets, FOR-Departments, …
├── infrastructure/                            # docker, env, deployment, grafana
├── plans/                                     # feature-plan template
├── prd/                                       # product requirements
└── task-tracker/                              # project status
```
