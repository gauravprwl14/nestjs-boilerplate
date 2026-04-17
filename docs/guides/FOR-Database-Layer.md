# FOR-Database-Layer.md — Database Layer Feature Guide

> Related: `docs/coding-guidelines/06-database-patterns.md`,
> `docs/architecture/service-architecture.md`, `docs/architecture/database-design.md`,
> `docs/guides/FOR-Multi-Tenancy.md`

---

## 1. Business Use Case

The database layer is the only place in the app that talks to Prisma. Goals:

- **Single responsibility** — feature services contain business logic;
  they never write SQL or touch the `@prisma/client` delegate directly.
- **Tenant isolation** — tenant-scoped aggregates read and write via
  `PrismaService.tenantScoped` (Prisma `$extends`-wrapped client). Services
  that need to act outside tenant scope (user lookup by `x-user-id`, company
  lookup) use the plain `PrismaService` client.
- **Transaction safety** — `DatabaseService.runInTransaction()` lets feature
  services compose multiple `*DbService` calls atomically. The transaction
  client is tenant-scoped too.
- **Testability** — each `*DbService` and `*DbRepository` can be mocked in
  isolation.
- **Encapsulation** — feature code never imports from `@prisma/client` for
  query types — `DbTransactionClient` (in `src/database/types.ts`) is the
  only Prisma-adjacent type that crosses the boundary.

---

## 2. Flow Diagram

```
Feature Service (TweetsService, DepartmentsService, …)
    │
    ├─ inject *DbService  (e.g. TweetsDbService)
    │       │
    │       └─ delegates to *DbRepository (e.g. TweetsDbRepository)
    │               │
    │               ├─ tenant-scoped reads/writes  → prisma.tenantScoped.<model>
    │               ├─ non-tenant reads            → prisma.<model>  (Users, Companies)
    │               └─ raw SQL (timeline)          → prisma.$queryRaw  (extension bypassed; hard-coded companyId)
    │
    └─ inject DatabaseService (cross-aggregate transactions)
            │
            └─ prisma.tenantScoped.$transaction(fn) — the `tx` threaded through
              *DbService calls is the tenant-scoped transaction client
```

---

## 3. Code Structure

```
src/database/
├── prisma/
│   ├── schema.prisma                 # Prisma schema (source of truth)
│   └── migrations/                   # `init_enterprise_twitter`
├── base.repository.ts                # Abstract base class for all repositories
├── database.module.ts                # @Global(); registers every DbRepository/DbService
├── database.service.ts               # Exposes runInTransaction(); nothing else
├── types.ts                          # DbTransactionClient type alias
├── prisma.service.ts                 # OnModuleInit; `tenantScoped` getter builds $extends client lazily
├── extensions/
│   └── tenant-scope.extension.ts     # Prisma $extends — injects/asserts companyId
├── users/
│   ├── users.db-repository.ts        # findAuthContext (plain client — runs before CLS tenant context)
│   └── users.db-service.ts
├── companies/
│   ├── companies.db-repository.ts    # findById (plain client — Company IS the tenant)
│   └── companies.db-service.ts
├── departments/
│   ├── departments.db-repository.ts  # Tenant-scoped (prisma.tenantScoped.department)
│   └── departments.db-service.ts
└── tweets/
    ├── tweets.db-repository.ts       # Tenant-scoped delegate writes + raw-SQL timeline query
    └── tweets.db-service.ts
```

---

## 4. Key Methods

### BaseRepository

Same API as before: `create`, `findUnique`, `findFirst`, `findMany`,
`findManyPaginated`, `update`, `delete`, `softDelete`, `restore`, `count`,
`exists`, `withTransaction`. All methods accept an optional `tx?: DbTransactionClient`.

Subclasses implement one abstract method:

```typescript
protected abstract delegateFor(
  client: PrismaService | DbTransactionClient,
): PrismaDelegate<…>;
```

Tenant-scoped repositories route through `prisma.tenantScoped` when the
client is the plain `PrismaService` (see `DepartmentsDbRepository` and
`TweetsDbRepository` for the idiom).

### DatabaseService

| Method                            | Description |
|-----------------------------------|-------------|
| `runInTransaction(fn, options?)`  | Execute callback atomically on the tenant-scoped client; pass `tx` into every `*DbService` call inside |

### UsersDbService

| Method                            | Description |
|-----------------------------------|-------------|
| `findAuthContext(id, tx?)`        | Returns `{ id, companyId, email, name, departmentIds }` or `null`. Used by `MockAuthMiddleware` — runs on the plain client (not tenant-scoped; user lookup happens before CLS is populated) |

### CompaniesDbService

| Method                            | Description |
|-----------------------------------|-------------|
| `findById(id, tx?)`               | `Company | null`. Companies are the tenant record itself, so this uses the plain client |

### DepartmentsDbService

| Method                                          | Description |
|-------------------------------------------------|-------------|
| `findManyByCompany(companyId, tx?)`             | Alphabetical list, tenant-scoped |
| `findByIdInCompany(id, companyId, tx?)`         | `Department | null` in the caller's tenant |
| `findExistingIdsInCompany(ids, companyId, tx?)` | Subset of requested ids that exist in the tenant (used to detect cross-tenant references; length mismatch → `VAL0008`) |
| `create(input, tx?)`                            | Flat create — tenant-scope extension injects/asserts `companyId` |

### TweetsDbService

| Method                                                  | Description |
|---------------------------------------------------------|-------------|
| `createWithTargets({ companyId, authorId, content, visibility, departmentIds })` | Wraps `TweetsDbRepository.createTweet` + `createTargets` in `runInTransaction`. Flat payloads only (no nested-connect into tenant-scoped relations) |
| `findTimelineForUser(userId, companyId, limit, tx?)`    | Delegates to the raw-SQL recursive-CTE query; returns `TimelineRow[]` (snake_case) |

---

## 5. Error Cases

The database layer does not throw domain `ErrorException`s of its own —
feature services translate `null` returns to `ErrorException.notFound(...)`,
and Prisma errors are handled by `AllExceptionsFilter` via
`handlePrismaError()`.

Exception: `tenantScopeExtension` throws `AUZ.CROSS_TENANT_ACCESS` when:
- a tenant-scoped op is attempted without `companyId` in CLS and without an
  explicit `BYPASS_TENANT_SCOPE` flag, or
- a write payload carries a `companyId` that disagrees with CLS.

---

## 6. Configuration

No additional configuration is required — the database layer is wired through
`DatabaseModule` which imports `PrismaModule`. Both are `@Global()`, so every
`*DbService` export is available to every feature module without adding imports.

`PrismaService.tenantScoped` is built lazily on first access via
`this.$extends(tenantScopeExtension(this.cls))` — the extension function
receives the request-scoped `ClsService` so it can read `companyId` on every
query without being re-wired per request.
