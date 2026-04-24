# 06 — Database Patterns

## Database Layer Architecture

The codebase uses a three-tier database layer. Feature services **never** touch Prisma directly.

```
Feature Service (e.g. TweetsService)
    ↓ injects
*DbService (e.g. TweetsDbService)        ← the public DB-layer API
    ↓ delegates to
*DbRepository (e.g. TweetsDbRepository)  ← Prisma calls, extends BaseRepository
    ↓ uses
PrismaService   (plain client + `tenantScoped` getter that returns a $extends-wrapped client)
```

- **`DatabaseModule`** (`@Global()`) — registers all `*DbRepository` + `*DbService` providers; exports the `*DbService` classes and `DatabaseService`.
- **`DatabaseService`** — exposes only `runInTransaction(fn)` for cross-aggregate atomic operations. Internally runs the transaction on `prisma.tenantScoped` so the tx client is also tenant-scoped.
- **`*DbService`** — one per aggregate (users, companies, departments, tweets); injected by feature services; thin delegation over the repository.
- **`MultiDbService`** — manages multiple raw `pg` pools (primary, read replica, metadata archive, cold archive connections); used by archival and mock-data modules for cross-database operations.
- **`ArchiveRegistryService`** — maintains a registry of cold archive database configs keyed by year; provides `getArchiveForYear(year, tier)`, `getAllArchives()`, and `getPoolForArchive(cfg)` helpers.
- **`*DbRepository`** — extends `BaseRepository`; implements `delegateFor(client)` to return the correct Prisma delegate; contains all SQL-level queries. Tenant-scoped repositories route through `prisma.tenantScoped` when the caller passed the plain root client.
- **`DbTransactionClient`** (`src/database/types.ts`) — opaque alias for `Prisma.TransactionClient`; feature code never imports from `@prisma/client` for transaction types.

### Tenant-Scoped vs Plain

Which client a repository uses determines whether the Prisma tenant-scope
extension participates:

| Aggregate       | Client used           | Why                                                                  |
| --------------- | --------------------- | -------------------------------------------------------------------- |
| `User`          | plain `PrismaService` | User lookup happens in `MockAuthMiddleware` BEFORE CLS is populated  |
| `Company`       | plain `PrismaService` | Company IS the tenant record — scoping it by `companyId` is circular |
| `Department`    | `prisma.tenantScoped` | Tenant-scoped                                                        |
| `Tweet` + pivot | `prisma.tenantScoped` | Tenant-scoped                                                        |

### Adding a new aggregate

1. Decide: is this aggregate tenant-scoped? If yes, add the model name to
   `TENANT_SCOPED_MODELS` in `src/database/extensions/tenant-scope.extension.ts`.
2. Create `src/database/<aggregate>/<aggregate>.db-repository.ts` extending
   `BaseRepository`. For tenant-scoped aggregates, route `delegateFor` through
   `prisma.tenantScoped` (see `DepartmentsDbRepository` for the idiom).
3. Create `src/database/<aggregate>/<aggregate>.db-service.ts` delegating to the repository.
4. Register both in `DatabaseModule` providers; export the `*DbService`.
5. Inject the `*DbService` in the feature service.

## Prisma Usage Rules

- All database access goes through a `*DbService` — feature services do **not** inject `PrismaService` or call Prisma directly.
- The Prisma client is configured with the `@prisma/adapter-pg` native driver adapter — do not instantiate `PrismaClient` directly.
- The Prisma schema lives at `src/database/prisma/schema.prisma`.
- Always use `select` or `include` explicitly — avoid returning columns like raw relations by accident.

## BaseRepository

`BaseRepository<TModel, …>` (at `src/database/base.repository.ts`) provides standard CRUD + pagination. Subclasses implement one abstract method:

```typescript
protected abstract delegateFor(
  client: PrismaService | DbTransactionClient,
): PrismaDelegate<…>;

// Tenant-scoped (Department/Tweet/…):
protected delegateFor(client: PrismaService | DbTransactionClient) {
  if (client === this.prisma) {
    return (this.prisma.tenantScoped as unknown as { department: Prisma.DepartmentDelegate }).department;
  }
  return (client as DbTransactionClient).department;
}

// Non-tenant (User/Company):
protected delegateFor(client: PrismaService | DbTransactionClient) {
  return client.user;
}
```

All base methods accept an optional `tx?: DbTransactionClient` parameter to participate in a transaction.

## Tenant-Scope Extension

Tenant-scoped reads and writes flow through `PrismaService.tenantScoped`, an
extended client built lazily via:

```typescript
this.$extends(tenantScopeExtension(this.cls));
```

The extension (see `src/database/extensions/tenant-scope.extension.ts`):

- Reads → injects `where.companyId = cls.get(COMPANY_ID)` for every tenant-scoped model.
- Writes → injects `data.companyId` when missing; rejects with `AUZ.CROSS_TENANT_ACCESS` when the payload carries a different companyId.
- Skips the injection when `ClsKey.BYPASS_TENANT_SCOPE` is explicitly `true` (seed scripts only).

**Blindspots:** `$queryRaw` / `$executeRaw` bypass the extension (the timeline
query hard-codes `company_id`); nested `connect` into tenant-scoped relations
is not validated (services must use flat writes and pre-validate ids).

## Transactions

Use `DatabaseService.runInTransaction()` when multiple writes across
`*DbService` calls must succeed atomically. The transaction client is the
tenant-scoped extended client, so scoping carries inside the tx too:

```typescript
await this.database.runInTransaction(async tx => {
  const tweet = await this.tweetsDb.createTweet({ … }, tx);
  await this.tweetsDb.createTargets(pivotRows, tx);
  return tweet;
});
```

The `tx` parameter threads through all `*DbService` methods — every method
accepts `tx?: DbTransactionClient` as its last argument.

## Pagination

Use the `PaginationParams` interface from `@common/interfaces` and return
`PaginatedResult<T>`. DbRepository methods handle the skip/take calculation
internally via `BaseRepository.findManyPaginated()`. The timeline currently
uses a fixed limit (`DEFAULT_TIMELINE_LIMIT`); cursor pagination is noted as
future work.

## Select / Include Best Practices

```typescript
// Good — explicit select on a tenant-scoped read
await this.prisma.tenantScoped.department.findMany({
  where: { companyId },
  select: { id: true, name: true, parentId: true },
});
```

## Migration Workflow

```bash
# Create and apply a new migration in dev
npm run prisma:migrate:dev -- --name <description>

# Apply pending migrations in production
npm run prisma:migrate:deploy

# After schema change, regenerate Prisma Client
npm run prisma:generate
```

Never edit migration SQL files manually after they have been applied to any environment.
