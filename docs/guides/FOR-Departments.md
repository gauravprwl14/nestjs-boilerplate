# FOR-Departments.md — Departments Module Feature Guide

> Related: `docs/diagrams/tweets-sequence.md`, `docs/architecture/database-design.md`,
> `docs/guides/FOR-Multi-Tenancy.md`, `docs/coding-guidelines/06-database-patterns.md`

---

## 1. Business Use Case

Departments give each tenant an arbitrary-depth org chart that can be targeted
by tweet visibility rules. The module covers:

- **Create** a department within the caller's company, optionally under a
  `parentId` that must also live in the same company.
- **List** every department in the caller's company (flat, alphabetical).
- **List** the same rows as a nested tree rooted at every department whose
  parent is null or outside the caller's result set.

The model is an **adjacency list** — `Department.parentId` self-references
`Department.id`. The composite FK `(parentId, companyId) → departments(id,
companyId)` makes it impossible to span tenants, even on a buggy insert path.

---

## 2. Flow Diagram

```
POST /departments
  → CLS resolves { companyId }
  → Zod validates { name, parentId? }
  → If parentId: findByIdInCompany → reject with DAT0009 if absent (cross-tenant or missing)
  → Tenant-scope extension asserts companyId in create payload
  → INSERT department

GET /departments        → findManyByCompany (alphabetical)
GET /departments/tree   → findManyByCompany + buildTree() (pure, single pass)
```

---

## 3. Code Structure

```
src/modules/departments/
├── departments.module.ts
├── departments.controller.ts       # POST/GET/GET tree
├── departments.service.ts          # Business logic + tree-building (buildTree)
└── dto/
    └── create-department.dto.ts    # Zod CreateDepartmentSchema

src/database/departments/            # @Global — provided by DatabaseModule
├── departments.db-repository.ts     # tenant-scoped delegate + composite-FK-aware create
└── departments.db-service.ts        # public surface: findManyByCompany, findByIdInCompany,
                                     # findExistingIdsInCompany, create
```

---

## 4. Key Methods

### DepartmentsService

| Method              | Description |
|---------------------|-------------|
| `list()`            | `findManyByCompany(companyId)` for the caller's tenant |
| `listTree()`        | Flat list → `buildTree()` (exported for unit tests) |
| `create(dto)`       | If `parentId`: verify it exists in the caller's company (`findByIdInCompany`), throw `DAT.DEPARTMENT_NOT_FOUND` otherwise; delegate to `departmentsDb.create({ companyId, parentId, name })` |

`requireCompanyId()` is the defensive companion to `AuthContextGuard` — if CLS
has no `companyId`, throw `DAT.COMPANY_NOT_FOUND` (the guard normally catches
this first).

### DepartmentsDbService

| Method                                         | Description |
|------------------------------------------------|-------------|
| `findManyByCompany(companyId, tx?)`            | Alphabetical list of every department in the tenant |
| `findByIdInCompany(id, companyId, tx?)`        | `findFirst({ id, companyId })` — null when absent or cross-tenant |
| `findExistingIdsInCompany(ids, companyId, tx?)`| Returns only the subset of ids that live in the tenant. Used by `TweetsService.create` to detect cross-tenant department references — length mismatch = violation |
| `create(input, tx?)`                           | Flat `delegate.create` — tenant-scope extension injects/asserts `companyId` |

### buildTree()

Pure function (exported for unit tests). Single pass to index by id, second
pass to wire children → returns every root (any node whose `parentId` is null
or not present in the input set).

---

## 5. Error Cases

| Scenario                                   | Error Code | HTTP Status |
|--------------------------------------------|------------|-------------|
| Missing/unknown `x-user-id` header         | `AUT0001`  | 401 |
| `name` missing / too long                  | `VAL0001`  | 400 |
| `parentId` points to a department in another tenant, or to a nonexistent id | `DAT0009` | 404 |
| CLS has no `companyId` (guard bypassed)    | `DAT0010`  | 404 |
| Cross-tenant create sneaks past validation (defensive backstop) | `AUZ0004` | 403 |

---

## 6. Configuration

No runtime environment variables are specific to this module. `DATABASE_URL`
is required for the global `PrismaService`.
