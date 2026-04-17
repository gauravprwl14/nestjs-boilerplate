# Enterprise Twitter — Multi-Tenant Backend

A NestJS 11 + Prisma 7 + PostgreSQL implementation of the take-home assignment
in `QUESTION.md`: a single backend serving many companies, with per-department
visibility and three-level visibility rules.

---

## Quickstart

```bash
# 1. Dependencies
npm install

# 2. Environment — dev DB defaults to local Postgres on 5432
cp .env.example .env.development
# (edit DATABASE_URL if your Postgres differs)

# 3. Schema
npm run prisma:migrate:dev          # applies `database migration for the product`

# 4. Seed — creates 2 companies, department trees, 7 users; prints user ids
npx prisma db seed

# 5. Run
npm run start:dev                   # http://localhost:3000

Swagger:   http://localhost:3000/docs
```

Authenticate any request by setting the `x-user-id` header to a seeded user id:

```bash
# Replace <ALICE> with the UUID printed by the seed command.
curl -H "x-user-id: <ALICE>" http://localhost:3000/api/v1/timeline
curl -H "x-user-id: <ALICE>" -H "Content-Type: application/json" \
     -X POST http://localhost:3000/api/v1/tweets \
     -d '{"content":"hello","visibility":"COMPANY"}'
```

---

## API

| Method | Path                       | Purpose                                                                                                                                                |
| ------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST   | `/api/v1/tweets`           | Create a tweet (content ≤ 280 chars; visibility ∈ {COMPANY, DEPARTMENTS, DEPARTMENTS_AND_SUBDEPARTMENTS}; `departmentIds` required for the latter two) |
| GET    | `/api/v1/timeline`         | Return tweets visible to the caller, newest first, up to 100 rows                                                                                      |
| POST   | `/api/v1/departments`      | Create a department (optional `parentId`, must be same-company)                                                                                        |
| GET    | `/api/v1/departments`      | Flat list of departments in the caller's company                                                                                                       |
| GET    | `/api/v1/departments/tree` | Same, nested by `parentId`                                                                                                                             |

All API endpoints require the `x-user-id` header. Missing or unknown ids yield
`401 AUT0001`.

---

## 1 · Multi-Tenant Approach

**Single shared database, `companyId` on every tenant-scoped table** — the
pragmatic shape for ~2 h of work and still production-defensible at small scale.
Isolation is enforced at five independent layers, so a bug in any one of them
still doesn't leak data:

1. **HTTP gate — `MockAuthMiddleware`** (`src/common/middleware/mock-auth.middleware.ts`).
   Reads `x-user-id`, loads the user + their company + their direct department
   memberships, and publishes them into CLS. Missing/unknown header → `401`.
2. **Global fail-fast guard — `AuthContextGuard`** (`src/common/guards/auth-context.guard.ts`).
   Registered as `APP_GUARD`. If `companyId` isn't in CLS (misconfigured route
   that skipped the middleware), the guard blocks the request before any query
   fires. `@Public()` routes (e.g. Swagger) bypass it.
3. **ORM guard — Prisma `$extends` tenant-scope extension** (`src/database/extensions/tenant-scope.extension.ts`).
   Applied to every delegate operation on `Department`, `UserDepartment`,
   `Tweet`, `TweetDepartment`. Reads auto-inject `where: { companyId }`; writes
   are rejected when `data.companyId` disagrees with the CLS value, or the
   caller omits it.
4. **Service-level pre-validation** — services resolve referenced ids within
   the caller's tenant before any write, so a cross-tenant `departmentId`
   surfaces a clean `VAL0008 DEPARTMENT_NOT_IN_COMPANY` instead of hitting FK
   constraints later.
5. **Schema-level composite FKs** — `(parentId, companyId) → departments(id, companyId)`
   and `(tweetId, companyId) / (departmentId, companyId) → tweets/departments(id, companyId)`
   on `TweetDepartment`. The database flat-out refuses a cross-tenant
   reference even if every layer above somehow failed.

### Known ORM blindspots we compensate for

Prisma extensions do **NOT** cover two paths:

- **Raw SQL (`$queryRaw`, `$executeRaw`)** bypasses `$extends`. The only raw
  query in the app is `findTimelineForUser`. It hard-codes `company_id =
${companyId}` as the first WHERE predicate and threads `companyId` into every
  sub-CTE. See `src/database/tweets/tweets.db-repository.ts`.
- **Nested writes via `connect`** are not validated by the extension's
  `args.data.companyId` check. Services never do nested-connect into
  tenant-scoped relations. `TweetsService.create` (`src/modules/tweets/tweets.service.ts`)
  instead fetches existing ids via `findExistingIdsInCompany` (extension-scoped
  → cross-tenant rows silently drop) and rejects any length mismatch with
  `VAL0008`. Then writes go via flat `createMany` with explicit `companyId` on
  every row.

---

## 2 · ACL Logic

Every tweet row carries:

| column                          | meaning                                                         |
| ------------------------------- | --------------------------------------------------------------- |
| `authorId`                      | the user who wrote it                                           |
| `companyId`                     | the tenant — visibility starts here                             |
| `visibility`                    | `COMPANY` \| `DEPARTMENTS` \| `DEPARTMENTS_AND_SUBDEPARTMENTS`  |
| targets (via `TweetDepartment`) | zero rows for COMPANY; one or more for the two department modes |

A user sees a tweet **iff**:

- Same `companyId` as the tweet, **and**
- Any one of these is true:
  - The tweet is authored by the caller (**author self-visibility** — authors
    always see their own posts, regardless of targets. Without this, a CEO in
    `Executive` posting a tweet to `Engineering` wouldn't see it in their own
    timeline — a confusing UX bug).
  - `visibility = COMPANY`.
  - `visibility = DEPARTMENTS` and at least one target dept is in the user's
    **direct** memberships.
  - `visibility = DEPARTMENTS_AND_SUBDEPARTMENTS` and at least one target
    dept is an **ancestor** (or equal) of one of the user's departments.

All four branches are evaluated in a **single recursive-CTE SQL query** — no
N+1, no in-app tree walking. See `src/database/tweets/tweets.db-repository.ts`
(`findTimelineForUser`). The access-control matrix has 13 cases (covering
every cross-product of company × visibility × membership × hierarchy depth)
and is exercised against a real Postgres instance in
`test/integration/acl-matrix.spec.ts`.

---

## 3 · Department Hierarchy

Departments are modelled as an **adjacency list** — each row has an optional
`parentId` self-reference. That's the simplest shape that still supports
unbounded tree depth.

The tricky part is reading the tree efficiently. Instead of looping in app code
(N queries per user), the timeline query uses a **Postgres `WITH RECURSIVE`
CTE** to climb from each of the user's direct departments up through parents
in one pass:

```sql
WITH RECURSIVE
  user_direct_depts AS (
    SELECT department_id AS id
    FROM user_departments WHERE user_id = $user AND company_id = $company
  ),
  user_dept_ancestors(id, parent_id) AS (
    SELECT d.id, d.parent_id FROM departments d
    WHERE d.id IN (SELECT id FROM user_direct_depts) AND d.company_id = $company
    UNION                                                                      -- <—
    SELECT p.id, p.parent_id FROM departments p
    INNER JOIN user_dept_ancestors uda ON p.id = uda.parent_id
    WHERE p.company_id = $company
  )
SELECT … FROM tweets WHERE …  (visibility branch uses both CTEs)
```

**`UNION` vs `UNION ALL`** — UNION is deliberate. When a user belongs to
multiple departments that share ancestors, per-iteration dedup keeps recursion
bounded by the subtree size instead of exploding. `UNION ALL` would revisit
the same ancestor from two paths.

**Cross-tenant safety** — every CTE and the outer select all filter on
`company_id = $company`. Combined with the composite FK on `departments`
(`parentId, companyId → id, companyId`), a tree can never cross tenants, even
if a bug in the department create path tried.

---

## Tests

```bash
npm test                                    # unit + ACL-matrix integration (117 + 2)
npm run test:e2e                            # tweets happy-path + 401 on missing header
npm run test:cov                            # with coverage (≥ 70% global, ≥ 80% services)
```

Key suites:

- `test/integration/acl-matrix.spec.ts` — 13-case visibility matrix against
  real Postgres, including the ghost-tweet (author self-view) case and the
  cross-tenant check.
- `test/unit/modules/tweets/tweets.service.spec.ts` — business-logic spec for
  the DTO-validation + flat-write + pre-check pathway.
- `test/unit/modules/departments/departments.service.spec.ts` — parent
  same-tenant enforcement + tree-builder correctness.
- `test/unit/common/middleware/mock-auth.middleware.spec.ts` — middleware CLS
  population and 401 paths.
- `test/e2e/tweets.e2e-spec.ts` — end-to-end POST → GET round-trip.

---

## What's Out of Scope (vs. a Full Product)

- **Pagination** on the timeline. Default limit 100; cursor pagination is a
  straightforward extension (add `before`/`limit` query params, carry
  `createdAt,id` as cursor).
- **Tweet update/delete, replies, likes, search** — not requested by the spec.
- **Registration/login/JWT/API keys.** The boilerplate shipped with those; we
  intentionally stripped them because the assignment explicitly allows mock
  auth. Production rollout would swap `MockAuthMiddleware` for a real JWT
  guard that still pushes `{userId, companyId, userDepartmentIds}` into CLS —
  everything downstream is unchanged.
- **Department update/delete** — only create + list exposed; we wanted to
  keep the surface tight.
- **Observability** — OpenTelemetry scaffolding is present under
  `src/telemetry/` but disabled by `OTEL_ENABLED=false`. Enable in infra envs.

---

## Tech Stack

NestJS 11 · Prisma 7 (driver adapter mode) · PostgreSQL · Zod for request
validation · Pino for structured logs · Jest + supertest for testing ·
nestjs-cls for AsyncLocalStorage-backed request context.

---

## Project Layout (relevant bits)

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
├── errors/error-codes/                        # adds AUZ.CROSS_TENANT_ACCESS,
│                                              # DAT.DEPARTMENT_NOT_FOUND / COMPANY_NOT_FOUND,
│                                              # VAL.DEPARTMENT_IDS_REQUIRED / DEPARTMENT_NOT_IN_COMPANY
└── …

prisma/seed.ts                                 # 2 companies, 3-level tree, 7 users + sample tweets
test/
├── unit/…                                     # co-located unit specs
├── integration/acl-matrix.spec.ts             # ★ the 13-case access-control proof
└── e2e/tweets.e2e-spec.ts                     # HTTP happy-path
```
