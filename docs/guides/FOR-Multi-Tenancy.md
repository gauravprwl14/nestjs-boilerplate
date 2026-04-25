# FOR-Multi-Tenancy.md — Multi-Tenant Isolation Feature Guide

> Related: `docs/architecture/high-level-architecture.md`,
> `docs/architecture/database-design.md`, `docs/guides/FOR-Orders.md`,
> `README.md` § "Multi-Tenant Approach"

---

## 1. Business Use Case

A single deployment serves many `Company` tenants concurrently. Isolation is
enforced at **five independent layers** so a bug in any one of them still
doesn't leak data between tenants:

1. **HTTP gate** — `MockAuthMiddleware` resolves `x-user-id`, loads the user +
   company + direct department memberships, and publishes them into CLS.
2. **Fail-fast guard** — `AuthContextGuard` (`APP_GUARD`) blocks any request
   that reaches a controller without a `companyId` in CLS. `@Public()` routes
   opt out.
3. **ORM guard** — `tenantScopeExtension` (Prisma `$extends`) injects
   `where: { companyId }` into every read on a tenant-scoped model and rejects
   any write whose payload disagrees with CLS.
4. **Service pre-validation** — services resolve referenced ids within the
   caller's tenant before any pivot write, producing a clean `VAL0008` instead
   of a schema-level FK error.
5. **Schema composite FKs** — `(parentId, companyId) → departments(id,
companyId)` and `(tweetId, companyId) / (departmentId, companyId) →
tweets/departments(id, companyId)` on `TweetDepartment` make cross-tenant
   hierarchy or targeting physically impossible.

---

## 2. Flow Diagram

```
Request ─▶ RequestIdMiddleware ─▶ SecurityHeadersMiddleware
        ─▶ MockAuthMiddleware
              ├─ no /api prefix → skip auth
              ├─ look up User by header → set CLS { userId, companyId, userDepartmentIds }
              └─ missing/unknown → throw AUT.UNAUTHENTICATED (401)
        ─▶ AuthContextGuard (APP_GUARD)
              ├─ @Public() → allow
              └─ no companyId in CLS → throw AUT.UNAUTHENTICATED
        ─▶ Controller → Service → *DbService → prisma.tenantScoped
                                      └─ tenantScopeExtension
                                            ├─ read: where.companyId = CLS.companyId
                                            └─ write: data.companyId must match, else AUZ.CROSS_TENANT_ACCESS
        ─▶ Prisma driver adapter → PostgreSQL
              └─ composite FKs reject physically impossible rows
```

---

## 3. Code Structure

```
src/common/
├── cls/
│   ├── cls.module.ts
│   └── cls.constants.ts              # ClsKey enum (USER_ID, COMPANY_ID, USER_DEPARTMENT_IDS, BYPASS_TENANT_SCOPE, …)
├── middleware/
│   └── mock-auth.middleware.ts       # ①  HTTP gate
└── guards/
    └── auth-context.guard.ts         # ②  Fail-fast APP_GUARD

src/database/
└── prisma.service.ts                 # PrismaService (used for migrations only in this branch)
```

> Note: The Prisma `tenant-scope.extension.ts` (ORM guard, layer ③) and the
> schema composite FK definitions (layer ⑤) applied to the enterprise-twitter
> domain (Departments, Tweets). In the order-management pivot, tenant isolation
> is enforced by service-level userId checks and parameterised SQL queries;
> there is no Prisma `$extends` guard in this branch.

Service-level validation (layer ④) is owned by each feature service.

---

## 4. Key Methods / Contracts

### MockAuthMiddleware

Reads `x-user-id` (must be a positive integer 1–10 000). Validates the header,
parses it to a `number`, and sets CLS — no DB lookup:

```
ClsKey.USER_ID = parseInt(x-user-id, 10)
```

Throws `AUT.UNAUTHENTICATED` on missing header or non-positive integer value.

> Note: In the enterprise-twitter domain `MockAuthMiddleware` called
> `UsersDbService.findAuthContext()` to resolve `{ userId, companyId,
userDepartmentIds }`. The order-management domain removed `UsersDbService`
> and simplified middleware to a header parse only.

### AuthContextGuard

Reads `ClsKey.USER_ID`. If absent (or falsy) and the route is not `@Public()`,
throws `AUT.UNAUTHENTICATED`.

### tenantScopeExtension

> The Prisma `tenantScopeExtension` (`$extends`) was removed in the
> `feat/observability` pivot. The order-management domain does not use
> Prisma for runtime queries, so ORM-level tenant scoping is no longer
> applicable. Tenant isolation is enforced via parameterised raw SQL
> (`WHERE user_id = $1`) in feature services.

### Known isolation blindspots (current branch)

- **Raw SQL** — all queries must include explicit `user_id` / `order_id`
  predicates. There is no automatic injection layer; services are responsible
  for passing the CLS `userId` into every query.
- **Pool routing** — cold-archive pools are shared across all users on the
  same cold-archive DB. Row-level isolation depends on the `user_id` predicate
  in each query.

---

## 5. Error Cases

| Scenario                              | Error Code | HTTP Status |
| ------------------------------------- | ---------- | ----------- |
| Missing `x-user-id` header            | `AUT0001`  | 401         |
| `x-user-id` is not a positive integer | `AUT0001`  | 401         |
| Guard reached without `userId` in CLS | `AUT0001`  | 401         |

---

## 6. Configuration

| Mechanism                 | Purpose                                                                           |
| ------------------------- | --------------------------------------------------------------------------------- |
| `USER_ID_HEADER` constant | Header name (`x-user-id`) — `src/common/constants/app.constants.ts`               |
| `ClsKey` enum             | Typed keys for CLS access — `src/common/cls/cls.constants.ts`                     |
| `AppClsModule`            | Imported FIRST in `AppModule.imports` to seed AsyncLocalStorage for every request |

No runtime env var specific to tenancy. `DATABASE_URL` is required for Prisma.
