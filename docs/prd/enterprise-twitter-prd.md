# Enterprise Twitter — Product Requirements Document

## Goal

Deliver a multi-tenant, Twitter-style backend where many companies share a single
deployment. Each company's users can post short messages ("tweets") visible
within their own tenant, with an additional per-department visibility layer.
The canonical problem statement lives in `QUESTION.md` at the repo root.

---

## Target Users

**Primary:** Engineering teams evaluating or building a multi-tenant enterprise
product. The module demonstrates defense-in-depth tenant isolation, recursive
department hierarchy, and a safe raw-SQL timeline query.

**Secondary:** AI coding assistants that use the structured docs to generate
code consistent with the established patterns (tenant-scope extension,
CLS-driven auth, DbService/DbRepository split, ErrorException discipline).

---

## Features

### Multi-Tenancy

- One backend process serves many `Company` tenants concurrently.
- Every tenant-scoped table carries a `companyId` column. Isolation is enforced
  at five independent layers — HTTP middleware, fail-fast guard, Prisma
  tenant-scope extension, service-level pre-validation, and schema-level
  composite FKs.
- Raw SQL is a known ORM blindspot; the one raw query (`findTimelineForUser`)
  threads `companyId` through every predicate and CTE.

### Authentication (Mock)

- The assignment explicitly allows mocked auth. The app reads the
  `x-user-id` header, looks the user up, and publishes
  `{ userId, companyId, userDepartmentIds }` into CLS.
- No registration/login/JWT/API-key endpoints ship with this build — the full
  JWT + API Key stack was stripped. A future production rollout would swap
  `MockAuthMiddleware` for a JWT guard that pushes the same tuple into CLS.

### Users & Departments

- A `User` belongs to exactly one `Company`.
- A `User` can belong to zero or more `Department`s via the `UserDepartment`
  pivot. (Membership is created by the seed script; no HTTP endpoint exposes
  membership management.)
- Departments form a tree (`parentId` self-reference, nullable). Same-tenant
  hierarchy is guaranteed at the schema layer via the composite FK
  `(parentId, companyId) → departments(id, companyId)`.
- Endpoints:
  - `POST /api/v1/departments` — create (optional `parentId`, same-tenant only)
  - `GET /api/v1/departments` — flat list for caller's company
  - `GET /api/v1/departments/tree` — nested tree

### Tweets & Timeline

Each tweet has `authorId`, `companyId`, `content` (≤ 280 chars), `visibility`,
`createdAt`, and zero or more `TweetDepartment` target rows.

Visibility values:

- `COMPANY` — visible to everyone in the same company.
- `DEPARTMENTS` — visible to members of the listed target departments.
- `DEPARTMENTS_AND_SUBDEPARTMENTS` — visible to members of the listed target
  departments **and** members of any sub-department underneath them.

A user sees a tweet **iff** `companyId` matches **and**:
- the user authored the tweet (author self-visibility, regardless of targets), or
- `visibility = COMPANY`, or
- `visibility = DEPARTMENTS` and ≥ 1 target is in the user's direct depts, or
- `visibility = DEPARTMENTS_AND_SUBDEPARTMENTS` and ≥ 1 target is an ancestor
  (or equal) of one of the user's direct depts.

All four branches are evaluated in a single recursive-CTE SQL query
(`findTimelineForUser`) — no N+1, no application-layer tree walking.

Endpoints:
- `POST /api/v1/tweets` — create
- `GET /api/v1/timeline` — newest-first, default limit 100 (`DEFAULT_TIMELINE_LIMIT`)

### Observability

- OpenTelemetry scaffolding (`src/telemetry/`) is present but disabled by
  default (`OTEL_ENABLED=false`). Enable in infrastructure envs.
- Pino-based structured logs via `AppLogger`.
- No BullMQ / Redis — removed from this build (not needed by the assignment).

### Infrastructure

- Mock-auth middleware (`x-user-id`) running before every `/api` request.
- Global `AuthContextGuard` as `APP_GUARD`; blocks any request that reaches a
  controller without a `companyId` in CLS (uses `@Public()` to opt-out).
- Request ID middleware (UUID per request).
- Security headers middleware (Helmet).
- Graceful shutdown with configurable timeout.

---

## API Endpoints

| # | Method | Path                       | Auth       | Description |
|---|--------|----------------------------|------------|-------------|
| 1 | POST   | `/api/v1/tweets`           | x-user-id  | Create a tweet (content ≤ 280; visibility ∈ {COMPANY, DEPARTMENTS, DEPARTMENTS_AND_SUBDEPARTMENTS}; `departmentIds` required for the latter two) |
| 2 | GET    | `/api/v1/timeline`         | x-user-id  | Return tweets visible to caller, newest first, limit 100 |
| 3 | POST   | `/api/v1/departments`      | x-user-id  | Create a department (optional `parentId`, must be same-company) |
| 4 | GET    | `/api/v1/departments`      | x-user-id  | Flat list of departments in caller's company |
| 5 | GET    | `/api/v1/departments/tree` | x-user-id  | Same list, nested by `parentId` |

> **Note:** All endpoints are prefixed with `/api/v1` (`API_PREFIX=api`,
> `API_VERSION=1`). Swagger docs at `/docs`. Missing or unknown `x-user-id`
> yields `401 AUT0001`.

---

## Non-Functional Requirements

| Category        | Requirement |
|-----------------|-------------|
| Tenant isolation| Five independent defense layers; no known path from tenant A's request to tenant B's data |
| Response time   | Timeline query p99 < 100 ms on seed data (recursive-CTE is the hot path) |
| Stateless       | No in-process queue/cache; horizontally scalable |
| Error format    | `{ success: false, errors: [{ code, message, errorType, errorCategory, retryable, details?, cause? }], requestId, traceId, timestamp }` |
| Validation      | All request bodies validated via Zod before handler execution |
| Test coverage   | ≥ 70% global, ≥ 80% on services; ACL matrix exercises 13 visibility cases against real Postgres |
| Config          | All configuration via environment variables (Zod-validated at startup) |

---

## Out of Scope (this build)

- Pagination on timeline (fixed limit 100; cursor pagination noted as future work)
- Tweet update/delete, replies, likes, search
- Registration, login, JWT, API keys (stripped — mock auth instead)
- Department update/delete
- User / department membership management endpoints (seed script handles it)
- Observability backends (OTel enabled via env; stack not shipped here)
