# Enterprise Twitter — Multi-Tenant Backend

A NestJS 11 + Prisma 7 + PostgreSQL backend for the take-home assignment in
`QUESTION.md`. One service, many companies, tweets with three levels of
per-department visibility.

---

## How to Run

```bash
# 1. Install
npm install

# 2. Env — defaults point to local Postgres on :5432
cp .env.example .env.development
# (edit DATABASE_URL if your Postgres is elsewhere)

# 3. Apply the schema
npm run prisma:migrate:dev

# 4. Seed — creates companies, department trees, users; prints user ids
npx prisma db seed

# 5. Start
npm run start:dev         # http://localhost:3000
                          # Swagger at http://localhost:3000/docs
```

Authenticate any request by setting `x-user-id` to a seeded user id:

```bash
# Replace <ALICE> with the UUID printed by the seed command.
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

All routes require the `x-user-id` header.

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

**Runtime & framework**

- **NestJS 11** on Node.js, HTTP via **Express** (`@nestjs/platform-express`).
- **TypeScript 6**, compiled by **SWC** (`nest-cli.json` → `builder: "swc"`,
  `@swc/core`) — `tsc` is still used for type-checking in CI (`npm run type:check`).
- **@nestjs/swagger** for OpenAPI generation at `/docs`.

**Database**

- **PostgreSQL 16** as the single shared store.
- **Prisma 7** in driver-adapter mode via **`@prisma/adapter-pg`** (native
  `pg` driver) — gives us Prisma's ergonomics plus direct control over
  connection pooling and raw SQL for the timeline CTE.

**Request context & validation**

- **nestjs-cls** — AsyncLocalStorage-backed request context; holds
  `userId`, `companyId`, `userDepartmentIds` for every request.
- **Zod 4** — request body validation and DTO inference.

**Observability**

- **Pino** + **nestjs-pino** — structured JSON logs with request
  correlation.
- **OpenTelemetry** — `@opentelemetry/sdk-node` + auto-instrumentations
  (HTTP, Express, Nest) and OTLP gRPC exporters for traces and metrics.
  Disabled by default (`OTEL_ENABLED=false`); flip it on for staging/prod.
  See [`docs/guides/FOR-Observability.md`](docs/guides/FOR-Observability.md)
  and [`docs/infrastructure/04-grafana-stack-setup.md`](docs/infrastructure/04-grafana-stack-setup.md).

**HTTP hardening**

- **Helmet** — standard security headers.
- Per-route `ZodValidationPipe` and `ParseUuidPipe` to reject malformed input early.

**Testing**

- **Jest 30** + **supertest** — unit, integration, and e2e suites.
- **@faker-js/faker** — deterministic fixtures for tests and seeds.

**Tooling**

- **ESLint** + **Prettier** — lint and format on save.
- **Husky** + **lint-staged** + **Commitlint** — pre-commit hygiene and
  conventional-commit enforcement.

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
