# 06 — Database Patterns

## Database Layer Architecture

The codebase uses a three-tier database layer. Feature services **never** touch Prisma directly.

```
Feature Service (e.g. AuthService)
    ↓ injects
*DbService (e.g. UsersDbService)        ← the public DB-layer API
    ↓ delegates to
*DbRepository (e.g. UsersDbRepository)  ← Prisma calls, extends BaseRepository
    ↓ uses
PrismaService
```

- **`DatabaseModule`** (`@Global()`) — registers all `*DbRepository` + `*DbService` providers and exports the `*DbService` classes and `DatabaseService`.
- **`DatabaseService`** — exposes only `runInTransaction(fn)` for cross-aggregate atomic operations.
- **`*DbService`** — one per aggregate (users, auth-credentials, todo-lists, …); injected by feature services; thin delegation layer over the repository.
- **`*DbRepository`** — extends `BaseRepository`; implements `delegateFor(client)` to return the correct Prisma delegate; contains all SQL-level queries.
- **`DbTransactionClient`** (`src/database/types.ts`) — opaque alias for `Prisma.TransactionClient`; feature code never imports from `@prisma/client` for transaction types.

### Adding a new aggregate

1. Create `src/database/<aggregate>/<aggregate>.db-repository.ts` extending `BaseRepository`.
2. Create `src/database/<aggregate>/<aggregate>.db-service.ts` delegating to the repository.
3. Register both in `DatabaseModule` providers; export the `*DbService`.
4. Inject the `*DbService` in the feature service.

## Prisma Usage Rules

- All database access goes through a `*DbService` in the database layer — feature services do **not** inject `PrismaService` or call Prisma directly.
- The Prisma client is configured with the `@prisma/adapter-pg` native driver adapter — do not instantiate `PrismaClient` directly.
- The Prisma schema lives at `src/database/prisma/schema.prisma`.
- Always use `select` or `include` explicitly — avoid returning columns like `passwordHash` by accident.

## BaseRepository

`BaseRepository<TModel, …>` (at `src/database/base.repository.ts`) provides standard CRUD + pagination. Subclasses implement one abstract method:

```typescript
protected abstract delegateFor(
  client: PrismaService | DbTransactionClient,
): PrismaDelegate<…>;

// Example in UsersDbRepository:
protected delegateFor(client: PrismaService | DbTransactionClient) {
  return client.user;
}
```

All base methods accept an optional `tx?: DbTransactionClient` parameter to participate in a transaction.

## Soft Delete

`User`, `TodoList`, and `TodoItem` are soft-deleted by setting `deletedAt = now()`. **Never hard-delete these records.**

```typescript
// Soft delete via DbService — correct
await this.todoListsDb.softDeleteById(id);

// Hard delete — WRONG for soft-deletable entities
await this.prisma.todoList.delete({ where: { id } }); // do NOT do this from feature code
```

`BaseRepository` provides `softDelete(where, tx?)` and `restore(where, tx?)`. Repositories that opt in set `protected supportsSoftDelete = true`.

Every `findUnique`, `findFirst`, and `findMany` on soft-deletable tables **must** include:

```typescript
where: {
  deletedAt: null;
}
```

DbRepository named methods (e.g. `findActiveByEmail`, `findByIdForUser`) apply this filter automatically.

## Ownership Checks

Before any mutation, verify the record belongs to the requesting user. Use repository named methods that combine ownership with the fetch:

```typescript
// Via DbService — correct
const list = await this.todoListsDb.findByIdForUser(userId, id);
if (!list) throw ErrorException.notFound('TodoList', id);
```

## Transactions

Use `DatabaseService.runInTransaction()` when multiple writes across `*DbService` calls must succeed atomically:

```typescript
// Inject DatabaseService in the feature service
await this.db.runInTransaction(async tx => {
  await this.authCredentialsDb.revokeAllActiveRefreshTokensForUser(userId, tx);
  await this.authCredentialsDb.issueRefreshToken({ token, userId, expiresAt }, tx);
});
```

The `tx` parameter threads through all `*DbService` methods — every method accepts `tx?: DbTransactionClient` as its last argument.

## Pagination

Use the `PaginationParams` interface from `@common/interfaces` and return `PaginatedResult<T>`. DbRepository methods handle the skip/take calculation internally via `BaseRepository.findManyPaginated()`:

```typescript
// In feature service
async findAll(userId: string, params: PaginationParams): Promise<PaginatedResult<TodoList>> {
  return this.todoListsDb.findActiveByUserId(userId, params);
}
```

## Select / Include Best Practices

```typescript
// Good — explicit select prevents leaking passwordHash
await this.prisma.user.findUnique({
  where: { id },
  select: {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    role: true,
    status: true,
  },
});

// Bad — returns passwordHash
await this.prisma.user.findUnique({ where: { id } });
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
