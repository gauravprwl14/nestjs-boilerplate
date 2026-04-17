# Database Layer Refactor — Design Spec

**Date:** 2026-04-17
**Status:** Approved design, ready for implementation planning
**Scope:** Internal restructure of the database/persistence layer. No schema changes, no new endpoints, no behavior changes.

---

## Problem

Today the Prisma schema lives under `prisma/` at the project root and each feature module owns a co-located `*.repository.ts` that extends `BaseRepository`. Two things are wrong with this:

1. **Layering is not enforced.** Feature services still build Prisma query types (e.g., `Prisma.TodoListWhereInput`) and pass them to the repository. Business code is coupled to Prisma's generated query language, so changing persistence later means touching every service.
2. **Persistence is not cohesive.** Each repository is 1:1 with a Prisma model. Models that belong to the same domain aggregate (e.g., `TodoItem` + `TodoItemTag`; `RefreshToken` + `ApiKey`) end up scattered, and cross-model flows — particularly transactional ones — have nowhere natural to live.

The existing `BaseRepository` is fine; what's missing is a **dedicated DB-layer service** in front of every repository that exposes an intent-revealing API, plus a **domain-aggregate grouping** of models.

## Goals

1. Move the Prisma schema/migrations/seed under `src/database/` so the whole persistence layer is one folder.
2. Enforce a strict layered contract: `Controller → FeatureService → AggregateDbService → AggregateDbRepository → PrismaService`.
3. `@prisma/client` may only be imported from files inside `src/database/**`. Feature services never construct or pass `Prisma.*Input` types.
4. Group models by DDD aggregate rather than 1:1 with Prisma models. Related queries and transactional flows live in the same DB service.
5. Provide an explicit, typed transaction boundary (`DatabaseService.runInTransaction`) that lets a feature service compose multiple DB-service calls atomically without ever importing `Prisma.TransactionClient` directly.

## Non-Goals

- No schema changes, no new columns, no migrations.
- No new HTTP endpoints, no request/response shape changes.
- No CLS-based implicit transactions (explicit threading only; may be revisited later).
- No raw SQL (`$queryRawUnsafe`) — deliberately off-limits.
- No hand-rolled domain entities to mirror Prisma models. Prisma model types are the public DB return type.
- No changes to logger contract, error-code registry, OpenTelemetry setup (beyond adding `@InstrumentClass` to new db-services for free tracing), or any module outside persistence.

---

## Architecture

### Layered contract

```
Controller  ──▶  FeatureService  ──▶  AggregateDbService  ──▶  AggregateDbRepository  ──▶  PrismaService
   (HTTP)         (business logic)      (DB-layer API)            (thin Prisma wrapper)        (Prisma client)
```

### Invariants enforced by the layout

1. `@prisma/client` is imported only from `src/database/**`. Feature services import nothing from Prisma query types; if they need a model type for a return signature they can import from `@prisma/client` **type-only** (e.g., `import type { User } from '@prisma/client'`) — ideally re-exported from `@database/types` instead.
2. Feature services receive Prisma model types as return values but never construct `Prisma.*WhereInput`, `Prisma.*CreateInput`, etc.
3. DB services expose **named, intent-revealing methods** (`findActiveByUserId`, `revokeAllForUser`) — never a generic `find(filter)`.
4. DB repositories are the only files that touch `this.prisma.<model>.*`.
5. `BaseRepository` is kept (generic CRUD) and lives at `src/database/base.repository.ts`. Each `*DbRepository` extends it and adds entity-specific queries.

### Module wiring — single `@Global() DatabaseModule`

```ts
// src/database/database.module.ts
@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    DatabaseService,
    UsersDbRepository,
    UsersDbService,
    AuthCredentialsDbRepository,
    AuthCredentialsDbService,
    TodoListsDbRepository,
    TodoListsDbService,
    TodoItemsDbRepository,
    TodoItemsDbService,
    TagsDbRepository,
    TagsDbService,
  ],
  exports: [
    DatabaseService,
    UsersDbService,
    AuthCredentialsDbService,
    TodoListsDbService,
    TodoItemsDbService,
    TagsDbService,
  ],
})
export class DatabaseModule {}
```

- `@Global()` mirrors the existing `PrismaModule`; feature modules inject `UsersDbService` etc. without `imports: []` boilerplate.
- Repositories are providers but **not exported** — only db-services are reachable from outside `src/database/`.
- `DatabaseService` is a thin wrapper that exposes `runInTransaction` and nothing else.
- The existing `PrismaModule` is unchanged and imported by `DatabaseModule`.

---

## Folder structure

```
src/database/
├── prisma/
│   ├── schema.prisma             # moved from /prisma/schema.prisma
│   ├── migrations/               # created on first migrate (new location)
│   └── seed.ts                   # if/when added
│
├── prisma.module.ts              # unchanged (@Global, exports PrismaService)
├── prisma.service.ts             # unchanged
│
├── database.module.ts            # NEW — @Global, aggregates all db-services
├── database.service.ts           # NEW — thin: runInTransaction()
├── base.repository.ts            # moved from ./repositories/base.repository.ts
├── types.ts                      # NEW — exports DbTransactionClient
│
├── users/
│   ├── users.db-repository.ts          # owns User
│   └── users.db-service.ts
│
├── auth-credentials/
│   ├── auth-credentials.db-repository.ts   # owns RefreshToken + ApiKey
│   └── auth-credentials.db-service.ts
│
├── todo-lists/
│   ├── todo-lists.db-repository.ts         # owns TodoList
│   └── todo-lists.db-service.ts
│
├── todo-items/
│   ├── todo-items.db-repository.ts         # owns TodoItem + TodoItemTag
│   └── todo-items.db-service.ts
│
└── tags/
    ├── tags.db-repository.ts               # owns Tag
    └── tags.db-service.ts
```

**Removed:**

- `src/database/repositories/` (folder collapses; `base.repository.ts` moves up one level)
- `src/modules/users/users.repository.ts`
- `src/modules/todo-lists/todo-lists.repository.ts`
- `src/modules/todo-items/todo-items.repository.ts`
- `src/modules/tags/tags.repository.ts`

The `src/modules/auth/` folder had no repository file previously — it queried through `users.repository`. After the refactor it injects `AuthCredentialsDbService` and `UsersDbService`.

**Path alias:** `@database/*` continues to resolve to `src/database/*`. New imports:

```ts
import { UsersDbService } from '@database/users/users.db-service';
import { DatabaseService } from '@database/database.service';
import type { DbTransactionClient } from '@database/types';
```

**Prisma tooling:** add to `package.json`:

```json
"prisma": {
  "schema": "src/database/prisma/schema.prisma"
}
```

This makes `prisma generate`, `prisma migrate dev`, etc. find the new location with no per-command flags.

---

## Domain-aggregate grouping

Five db-services (one per aggregate) instead of one per Prisma model.

| Folder              | Models owned              | Why grouped                                                                                                                                                     |
| ------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users/`            | `User`                    | Aggregate root for identity/profile.                                                                                                                            |
| `auth-credentials/` | `RefreshToken`, `ApiKey`  | Both are credentials belonging to a user with identical lifecycle patterns (issue, revoke, expire, rotate). Only consumed by `AuthModule`.                      |
| `todo-lists/`       | `TodoList`                | Aggregate root for a list.                                                                                                                                      |
| `todo-items/`       | `TodoItem`, `TodoItemTag` | `TodoItemTag` is the join table; `addTag(itemId, tagId)` / `removeTag(itemId, tagId)` read naturally as item operations and are only queried scoped to an item. |
| `tags/`             | `Tag`                     | Tag catalog (list/create/rename/delete). Assignment-to-item queries live with `todo-items/`.                                                                    |

For aggregates that own multiple Prisma models, the `*DbRepository` extends `BaseRepository` typed for the **primary** model and adds explicit named methods for the secondary model rather than trying to be generic over both.

---

## Class contracts

### `BaseRepository<...>`

Unchanged behavior, just relocated to `src/database/base.repository.ts`. Generic and abstract. Provides `create`, `findUnique`, `findFirst`, `findMany`, `findManyPaginated`, `update`, `delete`, `softDelete`, `restore`, `count`, `exists`, `withTransaction`.

**Two additive changes:**

1. Every CRUD method accepts an optional `tx?: DbTransactionClient` last parameter (defaults to `undefined` — backwards-compatible at call sites). The method internally routes through a transaction-aware delegate accessor (see next point).
2. The `delegate` getter becomes a protected method that accepts the active client. Today:

   ```ts
   protected abstract get delegate(): PrismaDelegate<...>;
   // subclass: protected get delegate() { return this.prisma.todoList; }
   ```

   After:

   ```ts
   protected abstract delegateFor(
     client: PrismaService | DbTransactionClient,
   ): PrismaDelegate<...>;
   // subclass: protected delegateFor(client) { return client.todoList; }
   ```

   Base CRUD methods then call `this.delegateFor(tx ?? this.prisma).<op>(...)`. Every concrete repository updates its accessor once; no other call-site change is needed for non-tx paths because `tx` defaults to `undefined`.

### `DatabaseService` — the transaction boundary

```ts
@Injectable()
export class DatabaseService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Runs `fn` inside a Prisma transaction. The DbTransactionClient is the only
   * way for a feature service to compose multiple db-service calls atomically.
   */
  async runInTransaction<R>(
    fn: (tx: DbTransactionClient) => Promise<R>,
    options?: { timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<R> {
    return this.prisma.transaction(fn, options);
  }
}
```

### `src/database/types.ts`

```ts
import type { Prisma } from '@prisma/client';

/**
 * The opaque transaction handle a feature service threads through db-service calls.
 * Aliased so feature code never imports from '@prisma/client' directly.
 */
export type DbTransactionClient = Prisma.TransactionClient;
```

### `*DbService` — feature-facing API (illustrative example)

```ts
@Injectable()
export class TodoListsDbService {
  constructor(private readonly repo: TodoListsDbRepository) {}

  createForUser(
    userId: string,
    input: { title: string; description?: string },
    tx?: DbTransactionClient,
  ): Promise<TodoList> {
    return this.repo.createForUser(userId, input, tx);
  }

  findActiveByUserId(
    userId: string,
    pagination: PaginationParams,
    tx?: DbTransactionClient,
  ): Promise<PaginatedResult<TodoList>> {
    return this.repo.findActiveByUserId(userId, pagination, tx);
  }

  findByIdForUser(userId: string, id: string, tx?: DbTransactionClient): Promise<TodoList | null> {
    return this.repo.findByIdForUser(userId, id, tx);
  }

  updateForUser(
    userId: string,
    id: string,
    patch: { title?: string; description?: string },
    tx?: DbTransactionClient,
  ): Promise<TodoList | null> {
    return this.repo.updateForUser(userId, id, patch, tx);
  }

  softDeleteForUser(
    userId: string,
    id: string,
    tx?: DbTransactionClient,
  ): Promise<TodoList | null> {
    return this.repo.softDeleteForUser(userId, id, tx);
  }
}
```

**Conventions baked into every `*DbService`:**

- **Inputs are plain object shapes** — never `Prisma.*Input`.
- **Returns are Prisma model types or `null`** (or `PaginatedResult<Model>`).
- **Method names describe intent.** Never `find(filter)` or `update(where, data)` at the public surface.
- **Last param is always `tx?: DbTransactionClient`** — every method can opt into a caller's transaction.
- **No domain errors thrown from db-services.** Return `null`/empty for "not found"; the feature service decides whether that's a 404 (`ErrorException.notFound(...)`) or a benign idempotent no-op. Only Prisma-layer errors (constraint violations) bubble up via the existing `prisma-error.handler` path.
- **No `AppLogger` calls.** Observability is handled by `@InstrumentClass` / `@Trace` decorators applied at the class level.

### `*DbRepository` — the only file that touches `this.prisma.<model>.*`

```ts
@Injectable()
export class TodoListsDbRepository extends BaseRepository<
  TodoList,
  Prisma.TodoListCreateInput,
  Prisma.TodoListUpdateInput,
  Prisma.TodoListWhereUniqueInput,
  Prisma.TodoListWhereInput,
  Prisma.TodoListOrderByWithRelationInput
> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  protected delegateFor(client: PrismaService | DbTransactionClient) {
    return client.todoList;
  }
  protected supportsSoftDelete = true;

  private client(tx?: DbTransactionClient) {
    return tx ?? this.prisma;
  }

  createForUser(
    userId: string,
    input: { title: string; description?: string },
    tx?: DbTransactionClient,
  ) {
    return this.client(tx).todoList.create({
      data: { ...input, user: { connect: { id: userId } } },
    });
  }

  findActiveByUserId(userId: string, pagination: PaginationParams, tx?: DbTransactionClient) {
    return this.findManyPaginated(pagination, { userId, deletedAt: null }, tx);
  }

  findByIdForUser(userId: string, id: string, tx?: DbTransactionClient) {
    return this.client(tx).todoList.findFirst({
      where: { id, userId, deletedAt: null },
    });
  }

  // updateForUser, softDeleteForUser, ...
}
```

The **transaction-aware client switcher** (`client(tx?)`) is the one new pattern in subclasses. `BaseRepository` CRUD methods resolve the same way internally (via `delegateFor`), so subclasses only need `client(tx?)` for queries that go outside the generic CRUD surface.

---

## Migration path

One aggregate at a time, each in its own commit so it's reviewable in isolation.

### Step 0 — Schema & tooling move (no behavior change)

- Move `prisma/schema.prisma` → `src/database/prisma/schema.prisma`.
- Add `"prisma": { "schema": "src/database/prisma/schema.prisma" }` to `package.json`.
- Run `npm run prisma:generate` and verify `@prisma/client` still resolves.
- No `migrations/` directory exists yet; it is created on first `prisma migrate dev` post-move and lands in the new location automatically.

### Step 1 — Database layer scaffolding (still no consumer changes)

- Move `src/database/repositories/base.repository.ts` → `src/database/base.repository.ts`. Update its import paths.
- Extend `BaseRepository` so each CRUD method takes `tx?: DbTransactionClient` (currently they don't). All internal calls become `this.client(tx).<model>...`.
- Create `src/database/types.ts` (`DbTransactionClient` alias).
- Create `src/database/database.service.ts` (`runInTransaction`).
- Create `src/database/database.module.ts` — empty providers list for now, `@Global()`, imports `PrismaModule`. Wire into `AppModule`.
- Old per-feature `*.repository.ts` files keep working — nothing depends on the new module yet.

### Step 2 — Build each aggregate, swap consumers one at a time

For each aggregate in dependency order (`users` → `auth-credentials` → `todo-lists` → `todo-items` → `tags`):

1. Create `src/database/<aggregate>/<aggregate>.db-repository.ts`. Port every query the feature `*.repository.ts` currently does (plus any inline `prisma.*` call in services). **Rename methods to intent-revealing names.**
2. Create `src/database/<aggregate>/<aggregate>.db-service.ts`. Inputs are plain shapes; expose only methods the feature service actually needs (no speculative API).
3. Register both in `DatabaseModule` providers; export only the db-service.
4. Refactor the feature service to inject `*DbService` and replace direct repository / Prisma calls. Remove `@prisma/client` imports from the feature service (or keep only type-only imports of model types).
5. Delete the feature module's old `*.repository.ts` and its provider entry in `*.module.ts`.
6. Update tests:
   - Old feature-service tests mocked `*Repository` → now mock `*DbService`.
   - New `*.db-service.spec.ts` mocks the `*DbRepository`.
   - New `*.db-repository.spec.ts` mocks the Prisma delegate (extend `test/helpers/prisma.mock.ts`).
7. Run `npm run type:check && npm test` — must pass before moving to the next aggregate.

### Step 3 — Auth flow's cross-aggregate transactions

After all aggregates exist, refactor `AuthService.register` (currently creates a User and issues a RefreshToken non-atomically) to use the new boundary:

```ts
return this.databaseService.runInTransaction(async tx => {
  const user = await this.usersDbService.create(input, tx);
  const refreshToken = await this.authCredentialsDbService.issueRefreshToken(user.id, ttl, tx);
  return { user, refreshToken };
});
```

This is the proof point that the transaction design works end-to-end.

### Step 4 — Cleanup

- Delete `src/database/repositories/` (now empty).
- Delete the root `prisma/` directory.
- Update `CLAUDE.md` Folder Map and the routing table.
- Update affected docs under `docs/coding-guidelines/06-database-patterns.md`, `docs/architecture/database-design.md`, the `FOR-*` guides, and the `add-module` skill.

---

## Tests

Per `docs/coding-guidelines/10-testing-standards.md`.

| Layer             | Test file                           | Mock                                                                                       | Coverage target |
| ----------------- | ----------------------------------- | ------------------------------------------------------------------------------------------ | --------------- |
| `*DbRepository`   | `<aggregate>.db-repository.spec.ts` | Prisma delegate via `test/helpers/prisma.mock.ts` (extend it for new models)               | ≥80% lines      |
| `*DbService`      | `<aggregate>.db-service.spec.ts`    | `*DbRepository` via factory in new `test/helpers/db-repositories.mock.ts`                  | ≥80% lines      |
| `FeatureService`  | existing `*.service.spec.ts`        | swap mocked `*Repository` → mocked `*DbService` via new `test/helpers/db-services.mock.ts` | unchanged       |
| `DatabaseService` | `database.service.spec.ts`          | mocked `PrismaService.transaction`                                                         | smoke test      |

E2E specs in `test/` need no changes — they hit real HTTP and a real test DB.

---

## Success criteria

1. `npm run type:check` passes.
2. `npm test` passes; coverage thresholds in `jest.config` are still met.
3. `npm run test:e2e` passes against a real Postgres + Redis (compose stack).
4. `npx prisma generate` and `npx prisma migrate dev --name noop` succeed against the new schema location.
5. `grep -r "@prisma/client" src/modules/ src/common/ src/bootstrap/` returns only type-only imports of model types (`User`, `TodoList`, etc.) — never `Prisma.*`. Ideally it returns nothing at all.
6. `grep -rn "this.prisma\." src/modules/` returns zero matches.
7. The Auth `register` flow runs inside `DatabaseService.runInTransaction` and is verifiable via an E2E test that simulates a token-issue failure and confirms the user row is rolled back.

---

## Risks

| Risk                                                                           | Mitigation                                                                                                                                                             |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prisma 7's schema-relocation flag varies by version.                           | Verify `package.json` `"prisma": { "schema": "..." }` works against installed `@prisma/client@^7.7.0` in Step 0 before doing anything else. Rollback is one file move. |
| `BaseRepository` extension to accept `tx?` could break existing callers.       | Default the new param to `undefined` and confirm the existing test suite passes after the BaseRepository edit alone (end of Step 1).                                   |
| Refactoring auth into a transaction reveals an existing race currently masked. | Cross-aggregate refactor is Step 3, after every aggregate is independently green. If the tx exposes a real bug it gets fixed there with full test isolation.           |

---

## Out of scope (reiterated)

- No schema changes, no new columns, no migrations.
- No new HTTP endpoints or request/response shape changes.
- No CLS-based implicit transactions.
- No raw SQL (`$queryRawUnsafe`).
- No hand-rolled domain entities mirroring Prisma models.
- No changes to the OpenTelemetry setup beyond optionally adding `@InstrumentClass` to new db-services for free tracing.
- No changes to the logger contract or the error-code registry.
