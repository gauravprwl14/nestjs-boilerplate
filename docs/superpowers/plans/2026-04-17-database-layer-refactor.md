# Database Layer Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure `src/database/` so Prisma schema, migrations, and a new `*DbService` + `*DbRepository` layer per domain aggregate all live under one folder — with `@prisma/client` imports restricted to `src/database/**` and feature services calling intent-revealing DB-service methods instead of constructing Prisma query types.

**Architecture:** Layered contract `Controller → FeatureService → AggregateDbService → AggregateDbRepository → PrismaService`. Five aggregates: `users/` (User), `auth-credentials/` (RefreshToken + ApiKey), `todo-lists/` (TodoList), `todo-items/` (TodoItem + TodoItemTag), `tags/` (Tag). A single `@Global() DatabaseModule` exposes all DB services and a `DatabaseService.runInTransaction(fn)` wrapper. No schema or behavior changes.

**Tech Stack:** NestJS 11, Prisma 7 (@prisma/client 7.7+, @prisma/adapter-pg), PostgreSQL 16, Jest, existing `BaseRepository` pattern.

**Spec:** `docs/superpowers/specs/2026-04-17-database-layer-refactor-design.md`

---

## Pre-flight

Before Task 1:

- Current branch is clean (`git status` shows no uncommitted changes).
- `npm install` has been run against the current lockfile.
- Postgres + Redis are running (`docker compose up -d` — for the e2e test gate at the end of each task).

Every task ends with the gate: **`npm run type:check && npm test`** must pass. If it doesn't, fix before committing.

---

## Task 1: Move Prisma schema to `src/database/prisma/`

**Files:**

- Create: `src/database/prisma/schema.prisma` (moved from `prisma/schema.prisma`)
- Delete: `prisma/` (top-level folder, after move)
- Modify: `package.json` (add `"prisma"` config block)

- [ ] **Step 1: Create the target directory**

```bash
mkdir -p src/database/prisma
```

- [ ] **Step 2: Move the schema file**

```bash
git mv prisma/schema.prisma src/database/prisma/schema.prisma
```

- [ ] **Step 3: Add Prisma config block to `package.json`**

Add a top-level `"prisma"` key alongside the existing `"lint-staged"` block:

```json
"prisma": {
  "schema": "src/database/prisma/schema.prisma"
}
```

- [ ] **Step 4: Delete the now-empty `prisma/` directory**

```bash
rmdir prisma
```

- [ ] **Step 5: Regenerate the Prisma client against the new schema location**

Run: `npm run prisma:generate`
Expected: `✔ Generated Prisma Client ... in ./node_modules/@prisma/client`. Exit code 0. No path errors.

- [ ] **Step 6: Verify the full build still works**

Run: `npm run type:check && npm test`
Expected: both pass. No `Cannot find schema` errors, no test failures.

- [ ] **Step 7: Commit**

```bash
git add src/database/prisma/schema.prisma package.json
git commit -m "refactor(db): move prisma schema under src/database/prisma"
```

---

## Task 2: Relocate and extend `BaseRepository` with tx-aware delegate

**Files:**

- Create: `src/database/base.repository.ts` (moved content from `src/database/repositories/base.repository.ts`)
- Create: `src/database/types.ts` (new)
- Delete: `src/database/repositories/base.repository.ts` and the empty `src/database/repositories/` folder (after move)
- Modify: `src/modules/users/users.repository.ts` — update import path
- Modify: `src/modules/todo-lists/todo-lists.repository.ts` — update import path + `delegate` getter → `delegateFor` method
- Modify: `src/modules/todo-items/todo-items.repository.ts` — update import path + `delegate` getter → `delegateFor` method
- Modify: `src/modules/tags/tags.repository.ts` — update import path + `delegate` getter → `delegateFor` method
- Modify: `src/modules/users/users.repository.ts` — update `delegate` getter → `delegateFor` method

- [ ] **Step 1: Create `src/database/types.ts`**

```ts
import type { Prisma } from '@prisma/client';

/**
 * The opaque transaction handle a feature service threads through db-service calls.
 * Aliased so feature code never imports from '@prisma/client' directly.
 */
export type DbTransactionClient = Prisma.TransactionClient;
```

- [ ] **Step 2: Create `src/database/base.repository.ts` with the tx-aware delegate**

Copy the content from `src/database/repositories/base.repository.ts` and apply the two edits below (the delegate accessor becomes a method; every CRUD method routes through it with an optional `tx`):

```ts
import { PaginationParams, PaginatedResult, PaginationMeta } from '@common/interfaces';
import { DEFAULT_PAGE, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '@common/constants';
import { PrismaService } from '@database/prisma.service';
import { Prisma } from '@prisma/client';
import { DbTransactionClient } from '@database/types';

interface PrismaDelegate<
  TModel,
  TCreateInput,
  TUpdateInput,
  TWhereUniqueInput,
  TWhereInput,
  TOrderByInput,
> {
  create(args: { data: TCreateInput; include?: Record<string, unknown> }): Promise<TModel>;
  findUnique(args: {
    where: TWhereUniqueInput;
    include?: Record<string, unknown>;
  }): Promise<TModel | null>;
  findFirst(args: {
    where?: TWhereInput;
    include?: Record<string, unknown>;
  }): Promise<TModel | null>;
  findMany(args: {
    where?: TWhereInput;
    orderBy?: TOrderByInput | TOrderByInput[];
    skip?: number;
    take?: number;
    include?: Record<string, unknown>;
  }): Promise<TModel[]>;
  update(args: { where: TWhereUniqueInput; data: TUpdateInput }): Promise<TModel>;
  delete(args: { where: TWhereUniqueInput }): Promise<TModel>;
  count(args?: { where?: TWhereInput }): Promise<number>;
}

export abstract class BaseRepository<
  TModel,
  TCreateInput,
  TUpdateInput,
  TWhereUniqueInput,
  TWhereInput,
  TOrderByInput,
> {
  constructor(protected readonly prisma: PrismaService) {}

  /**
   * Returns the Prisma delegate bound to either a transaction client or the
   * shared PrismaService. Concrete subclasses implement it, e.g.:
   *   return client.user;
   */
  protected abstract delegateFor(
    client: PrismaService | DbTransactionClient,
  ): PrismaDelegate<
    TModel,
    TCreateInput,
    TUpdateInput,
    TWhereUniqueInput,
    TWhereInput,
    TOrderByInput
  >;

  protected supportsSoftDelete = false;

  /** Resolves the active client (transaction override or default Prisma). */
  protected client(tx?: DbTransactionClient): PrismaService | DbTransactionClient {
    return tx ?? this.prisma;
  }

  async create(data: TCreateInput, tx?: DbTransactionClient): Promise<TModel> {
    return this.delegateFor(this.client(tx)).create({ data });
  }

  async findUnique(
    where: TWhereUniqueInput,
    include?: Record<string, unknown>,
    tx?: DbTransactionClient,
  ): Promise<TModel | null> {
    return this.delegateFor(this.client(tx)).findUnique({
      where,
      ...(include ? { include } : {}),
    });
  }

  async findFirst(
    where?: TWhereInput,
    include?: Record<string, unknown>,
    tx?: DbTransactionClient,
  ): Promise<TModel | null> {
    return this.delegateFor(this.client(tx)).findFirst({
      ...(where ? { where } : {}),
      ...(include ? { include } : {}),
    });
  }

  async findMany(
    where?: TWhereInput,
    orderBy?: TOrderByInput | TOrderByInput[],
    include?: Record<string, unknown>,
    tx?: DbTransactionClient,
  ): Promise<TModel[]> {
    return this.delegateFor(this.client(tx)).findMany({
      ...(where ? { where } : {}),
      ...(orderBy ? { orderBy } : {}),
      ...(include ? { include } : {}),
    });
  }

  async findManyPaginated(
    params: PaginationParams,
    where?: TWhereInput,
    include?: Record<string, unknown>,
    tx?: DbTransactionClient,
  ): Promise<PaginatedResult<TModel>> {
    const page = Math.max(1, params.page ?? DEFAULT_PAGE);
    const limit = Math.min(Math.max(1, params.limit ?? DEFAULT_PAGE_LIMIT), MAX_PAGE_LIMIT);
    const skip = (page - 1) * limit;
    const delegate = this.delegateFor(this.client(tx));

    const [data, total] = await Promise.all([
      delegate.findMany({
        ...(where ? { where } : {}),
        skip,
        take: limit,
        ...(include ? { include } : {}),
      }),
      delegate.count({ ...(where ? { where } : {}) }),
    ]);

    const totalPages = Math.ceil(total / limit);
    const meta: PaginationMeta = {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
    return { data, meta };
  }

  async update(
    where: TWhereUniqueInput,
    data: TUpdateInput,
    tx?: DbTransactionClient,
  ): Promise<TModel> {
    return this.delegateFor(this.client(tx)).update({ where, data });
  }

  async delete(where: TWhereUniqueInput, tx?: DbTransactionClient): Promise<TModel> {
    return this.delegateFor(this.client(tx)).delete({ where });
  }

  async softDelete(where: TWhereUniqueInput, tx?: DbTransactionClient): Promise<TModel> {
    return this.delegateFor(this.client(tx)).update({
      where,
      data: { deletedAt: new Date() } as unknown as TUpdateInput,
    });
  }

  async restore(where: TWhereUniqueInput, tx?: DbTransactionClient): Promise<TModel> {
    return this.delegateFor(this.client(tx)).update({
      where,
      data: { deletedAt: null } as unknown as TUpdateInput,
    });
  }

  async count(where?: TWhereInput, tx?: DbTransactionClient): Promise<number> {
    return this.delegateFor(this.client(tx)).count({ ...(where ? { where } : {}) });
  }

  async exists(where?: TWhereInput, tx?: DbTransactionClient): Promise<boolean> {
    const cnt = await this.delegateFor(this.client(tx)).count({
      ...(where ? { where } : {}),
    });
    return cnt > 0;
  }

  /**
   * Execute a callback within a Prisma transaction.
   * Prefer `DatabaseService.runInTransaction(...)` from outside the DB layer.
   */
  async withTransaction<R>(
    fn: (tx: Prisma.TransactionClient) => Promise<R>,
    options?: { timeout?: number },
  ): Promise<R> {
    return this.prisma.$transaction(fn, {
      timeout: options?.timeout ?? 10000,
    });
  }
}
```

- [ ] **Step 3: Delete the old location**

```bash
git rm src/database/repositories/base.repository.ts
rmdir src/database/repositories
```

- [ ] **Step 4: Update each concrete repository — import path + delegate**

Four files need the same two edits. For each:

a) Change the import line

```ts
import { BaseRepository } from '@database/repositories/base.repository';
```

to

```ts
import { BaseRepository } from '@database/base.repository';
```

b) Replace the delegate getter, e.g. in `src/modules/users/users.repository.ts`:

```ts
protected get delegate() {
  return this.prisma.user;
}
```

becomes

```ts
protected delegateFor(client: PrismaService | DbTransactionClient) {
  return client.user;
}
```

Do this in:

- `src/modules/users/users.repository.ts` → `client.user`
- `src/modules/todo-lists/todo-lists.repository.ts` → `client.todoList`
- `src/modules/todo-items/todo-items.repository.ts` → `client.todoItem`
- `src/modules/tags/tags.repository.ts` → `client.tag`

Also add `import { DbTransactionClient } from '@database/types';` to each of those four files.

- [ ] **Step 5: Verify**

Run: `npm run type:check && npm test`
Expected: type check clean, all existing tests still pass (behavior unchanged — new `tx?` params default to `undefined`).

- [ ] **Step 6: Commit**

```bash
git add src/database/base.repository.ts src/database/types.ts src/modules/*/*.repository.ts
git commit -m "refactor(db): relocate BaseRepository and add tx-aware delegateFor"
```

---

## Task 3: Scaffold `DatabaseService` and `DatabaseModule`

**Files:**

- Create: `src/database/database.service.ts`
- Create: `src/database/database.module.ts`
- Create: `test/unit/database/database.service.spec.ts`
- Modify: `src/app.module.ts` — import `DatabaseModule`

- [ ] **Step 1: Write the failing `DatabaseService` test**

```ts
// test/unit/database/database.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@database/prisma.service';
import { DatabaseService } from '@database/database.service';

describe('DatabaseService', () => {
  let service: DatabaseService;
  let prisma: { transaction: jest.Mock };

  beforeEach(async () => {
    prisma = { transaction: jest.fn().mockImplementation(cb => cb('tx-client')) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [DatabaseService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(DatabaseService);
  });

  describe('runInTransaction', () => {
    it('should delegate to PrismaService.transaction and pass the tx client to the callback', async () => {
      // Arrange
      const cb = jest.fn().mockResolvedValue('result');

      // Act
      const result = await service.runInTransaction(cb);

      // Assert
      expect(prisma.transaction).toHaveBeenCalledWith(cb, undefined);
      expect(cb).toHaveBeenCalledWith('tx-client');
      expect(result).toBe('result');
    });

    it('should forward transaction options', async () => {
      // Arrange
      const cb = jest.fn().mockResolvedValue('ok');
      const options = { timeout: 5000 };

      // Act
      await service.runInTransaction(cb, options);

      // Assert
      expect(prisma.transaction).toHaveBeenCalledWith(cb, options);
    });
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx jest test/unit/database/database.service.spec.ts`
Expected: FAIL — cannot import `@database/database.service` (module does not exist).

- [ ] **Step 3: Implement `DatabaseService`**

```ts
// src/database/database.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { DbTransactionClient } from '@database/types';

/**
 * DB-layer boundary used by feature services to compose multiple db-service
 * calls atomically. Exposes runInTransaction and nothing else; all entity
 * queries belong on the per-aggregate *DbService classes.
 */
@Injectable()
export class DatabaseService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Runs `fn` inside a Prisma transaction. The DbTransactionClient passed to
   * the callback is the same type db-service methods accept as their `tx?`
   * parameter — feature code never imports from '@prisma/client' directly.
   *
   * @param fn - Callback receiving the tx client
   * @param options - Prisma transaction options (timeout, isolationLevel)
   */
  async runInTransaction<R>(
    fn: (tx: DbTransactionClient) => Promise<R>,
    options?: { timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<R> {
    return this.prisma.transaction(fn, options);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest test/unit/database/database.service.spec.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Create `DatabaseModule`**

```ts
// src/database/database.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '@database/prisma.module';
import { DatabaseService } from '@database/database.service';

/**
 * Global database module. Aggregates every per-entity DbService + DbRepository
 * and exposes the transaction boundary. Feature modules inject the DbServices
 * without needing to import this module.
 *
 * Per-aggregate providers (users, auth-credentials, todo-lists, todo-items,
 * tags) are added in later tasks.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
```

- [ ] **Step 6: Wire `DatabaseModule` into `AppModule`**

Edit `src/app.module.ts` to add `DatabaseModule` to the `imports` array (next to `PrismaModule`):

```ts
import { DatabaseModule } from '@database/database.module';
// ...
@Module({
  imports: [
    // ...existing entries...
    PrismaModule,
    DatabaseModule,
    // ...
  ],
})
export class AppModule {}
```

- [ ] **Step 7: Verify**

Run: `npm run type:check && npm test`
Expected: all pass. App boots at least in test context.

- [ ] **Step 8: Commit**

```bash
git add src/database/database.service.ts src/database/database.module.ts test/unit/database/database.service.spec.ts src/app.module.ts
git commit -m "feat(db): add DatabaseService.runInTransaction and @Global DatabaseModule"
```

---

## Task 4: Migrate `users/` aggregate

**Files:**

- Create: `src/database/users/users.db-repository.ts`
- Create: `src/database/users/users.db-service.ts`
- Create: `test/unit/database/users/users.db-repository.spec.ts`
- Create: `test/unit/database/users/users.db-service.spec.ts`
- Modify: `src/database/database.module.ts` — register providers
- Modify: `src/modules/users/users.service.ts` — inject `UsersDbService` instead of `UsersRepository`
- Modify: `src/modules/users/users.module.ts` — remove `UsersRepository` provider
- Modify: `src/modules/auth/auth.service.ts` — inject `UsersDbService` instead of `UsersRepository`
- Modify: `src/modules/auth/auth.module.ts` — remove `UsersRepository` provider
- Modify: `test/unit/auth/auth.service.spec.ts` — mock `UsersDbService`
- Delete: `src/modules/users/users.repository.ts` (at end of task)

### New DB-service API (intent-revealing replacements for current `UsersRepository` / inline prisma calls)

| Old call (feature service)                                                     | New call (on `UsersDbService`)                                                                     |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `usersRepository.findUnique({ id })`                                           | `findById(id)`                                                                                     |
| `usersRepository.findByEmail(email)` (already well-named)                      | `findActiveByEmail(email)` (keeps "non-deleted" filter)                                            |
| `usersRepository.findActiveById(id)`                                           | `findActiveById(id)`                                                                               |
| `usersRepository.create({ email, passwordHash, firstName, lastName, status })` | `create(input)` where `input: { email; passwordHash; firstName?; lastName?; status?: UserStatus }` |
| `usersRepository.update({ id }, { firstName, lastName })`                      | `updateProfile(id, patch: { firstName?: string \| null; lastName?: string \| null })`              |
| `usersRepository.update({ id }, { passwordHash })`                             | `updatePassword(id, passwordHash)`                                                                 |
| `usersRepository.update({ id }, { failedLoginCount, lockedUntil })`            | `recordFailedLogin(id, { count, lockedUntil })`                                                    |
| `usersRepository.update({ id }, { failedLoginCount: 0, lockedUntil: null })`   | `resetFailedLogin(id)`                                                                             |

- [ ] **Step 1: Write the failing `UsersDbRepository` test**

```ts
// test/unit/database/users/users.db-repository.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { UsersDbRepository } from '@database/users/users.db-repository';
import { createMockPrisma } from '../../../helpers/mock-prisma';

describe('UsersDbRepository', () => {
  let repo: UsersDbRepository;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersDbRepository, { provide: PrismaService, useValue: prisma }],
    }).compile();
    repo = module.get(UsersDbRepository);
  });

  describe('findActiveByEmail', () => {
    it('should query by email and deletedAt: null', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u1', email: 'a@b.c' });

      const result = await repo.findActiveByEmail('a@b.c');

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { email: 'a@b.c', deletedAt: null },
      });
      expect(result).toEqual({ id: 'u1', email: 'a@b.c' });
    });
  });

  describe('findActiveById', () => {
    it('should query by id, deletedAt: null, status: ACTIVE', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u1' });

      await repo.findActiveById('u1');

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: 'u1', deletedAt: null, status: UserStatus.ACTIVE },
      });
    });
  });

  describe('recordFailedLogin', () => {
    it('should update failedLoginCount and lockedUntil', async () => {
      const locked = new Date('2026-04-17T12:00:00Z');
      prisma.user.update.mockResolvedValue({ id: 'u1' });

      await repo.recordFailedLogin('u1', { count: 3, lockedUntil: locked });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { failedLoginCount: 3, lockedUntil: locked },
      });
    });
  });

  describe('resetFailedLogin', () => {
    it('should zero failedLoginCount and null lockedUntil', async () => {
      prisma.user.update.mockResolvedValue({ id: 'u1' });

      await repo.resetFailedLogin('u1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
    });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx jest test/unit/database/users/users.db-repository.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `UsersDbRepository`**

```ts
// src/database/users/users.db-repository.ts
import { Injectable } from '@nestjs/common';
import { Prisma, User, UserStatus } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { BaseRepository } from '@database/base.repository';
import { DbTransactionClient } from '@database/types';

@Injectable()
export class UsersDbRepository extends BaseRepository<
  User,
  Prisma.UserCreateInput,
  Prisma.UserUpdateInput,
  Prisma.UserWhereUniqueInput,
  Prisma.UserWhereInput,
  Prisma.UserOrderByWithRelationInput
> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  protected delegateFor(client: PrismaService | DbTransactionClient) {
    return client.user;
  }
  protected supportsSoftDelete = true;

  /** Finds a non-deleted user by email. */
  async findActiveByEmail(email: string, tx?: DbTransactionClient): Promise<User | null> {
    return this.client(tx).user.findFirst({ where: { email, deletedAt: null } });
  }

  /** Finds a non-deleted, ACTIVE user by id. */
  async findActiveById(id: string, tx?: DbTransactionClient): Promise<User | null> {
    return this.client(tx).user.findFirst({
      where: { id, deletedAt: null, status: UserStatus.ACTIVE },
    });
  }

  /** Records a failed login attempt and (optionally) locks the account. */
  async recordFailedLogin(
    id: string,
    patch: { count: number; lockedUntil?: Date | null },
    tx?: DbTransactionClient,
  ): Promise<User> {
    return this.client(tx).user.update({
      where: { id },
      data: {
        failedLoginCount: patch.count,
        ...(patch.lockedUntil !== undefined ? { lockedUntil: patch.lockedUntil } : {}),
      },
    });
  }

  /** Zeroes the failed-login counter and clears the lock. */
  async resetFailedLogin(id: string, tx?: DbTransactionClient): Promise<User> {
    return this.client(tx).user.update({
      where: { id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  }

  /** Updates profile fields (firstName/lastName). */
  async updateProfile(
    id: string,
    patch: { firstName?: string | null; lastName?: string | null },
    tx?: DbTransactionClient,
  ): Promise<User> {
    return this.client(tx).user.update({
      where: { id },
      data: patch,
    });
  }

  /** Updates just the password hash. */
  async updatePassword(id: string, passwordHash: string, tx?: DbTransactionClient): Promise<User> {
    return this.client(tx).user.update({
      where: { id },
      data: { passwordHash },
    });
  }

  /** Internally-reusable helper: finds by id regardless of status/deletedAt. */
  async findById(id: string, tx?: DbTransactionClient): Promise<User | null> {
    return this.client(tx).user.findUnique({ where: { id } });
  }

  /** Creates a user from a plain input shape. */
  async createUser(
    input: {
      email: string;
      passwordHash: string;
      firstName?: string | null;
      lastName?: string | null;
      status?: UserStatus;
    },
    tx?: DbTransactionClient,
  ): Promise<User> {
    return this.client(tx).user.create({ data: input });
  }
}
```

- [ ] **Step 4: Run the repository test to verify it passes**

Run: `npx jest test/unit/database/users/users.db-repository.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing `UsersDbService` test**

```ts
// test/unit/database/users/users.db-service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { UsersDbRepository } from '@database/users/users.db-repository';
import { UsersDbService } from '@database/users/users.db-service';

describe('UsersDbService', () => {
  let service: UsersDbService;
  let repo: jest.Mocked<UsersDbRepository>;

  beforeEach(async () => {
    const repoMock: Partial<jest.Mocked<UsersDbRepository>> = {
      findById: jest.fn(),
      findActiveByEmail: jest.fn(),
      findActiveById: jest.fn(),
      createUser: jest.fn(),
      updateProfile: jest.fn(),
      updatePassword: jest.fn(),
      recordFailedLogin: jest.fn(),
      resetFailedLogin: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersDbService, { provide: UsersDbRepository, useValue: repoMock }],
    }).compile();

    service = module.get(UsersDbService);
    repo = module.get(UsersDbRepository);
  });

  it('findById delegates to repo.findById', async () => {
    repo.findById.mockResolvedValue({ id: 'u1' } as never);

    const r = await service.findById('u1');

    expect(repo.findById).toHaveBeenCalledWith('u1', undefined);
    expect(r).toEqual({ id: 'u1' });
  });

  it('updateProfile forwards patch to repo.updateProfile', async () => {
    repo.updateProfile.mockResolvedValue({ id: 'u1' } as never);

    await service.updateProfile('u1', { firstName: 'A' });

    expect(repo.updateProfile).toHaveBeenCalledWith('u1', { firstName: 'A' }, undefined);
  });

  it('create forwards input to repo.createUser', async () => {
    repo.createUser.mockResolvedValue({ id: 'u1' } as never);

    await service.create({ email: 'a@b.c', passwordHash: 'h' });

    expect(repo.createUser).toHaveBeenCalledWith({ email: 'a@b.c', passwordHash: 'h' }, undefined);
  });
});
```

- [ ] **Step 6: Run the service test and confirm it fails**

Run: `npx jest test/unit/database/users/users.db-service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `UsersDbService`**

```ts
// src/database/users/users.db-service.ts
import { Injectable } from '@nestjs/common';
import { User, UserStatus } from '@prisma/client';
import { UsersDbRepository } from '@database/users/users.db-repository';
import { DbTransactionClient } from '@database/types';

/**
 * DB-layer service for the User aggregate. Only file outside src/database
 * that can reach User. Feature services (UsersService, AuthService) inject
 * this instead of a repository.
 */
@Injectable()
export class UsersDbService {
  constructor(private readonly repo: UsersDbRepository) {}

  findById(id: string, tx?: DbTransactionClient): Promise<User | null> {
    return this.repo.findById(id, tx);
  }

  findActiveByEmail(email: string, tx?: DbTransactionClient): Promise<User | null> {
    return this.repo.findActiveByEmail(email, tx);
  }

  findActiveById(id: string, tx?: DbTransactionClient): Promise<User | null> {
    return this.repo.findActiveById(id, tx);
  }

  create(
    input: {
      email: string;
      passwordHash: string;
      firstName?: string | null;
      lastName?: string | null;
      status?: UserStatus;
    },
    tx?: DbTransactionClient,
  ): Promise<User> {
    return this.repo.createUser(input, tx);
  }

  updateProfile(
    id: string,
    patch: { firstName?: string | null; lastName?: string | null },
    tx?: DbTransactionClient,
  ): Promise<User> {
    return this.repo.updateProfile(id, patch, tx);
  }

  updatePassword(id: string, passwordHash: string, tx?: DbTransactionClient): Promise<User> {
    return this.repo.updatePassword(id, passwordHash, tx);
  }

  recordFailedLogin(
    id: string,
    patch: { count: number; lockedUntil?: Date | null },
    tx?: DbTransactionClient,
  ): Promise<User> {
    return this.repo.recordFailedLogin(id, patch, tx);
  }

  resetFailedLogin(id: string, tx?: DbTransactionClient): Promise<User> {
    return this.repo.resetFailedLogin(id, tx);
  }
}
```

- [ ] **Step 8: Run the service test to verify it passes**

Run: `npx jest test/unit/database/users/users.db-service.spec.ts`
Expected: PASS.

- [ ] **Step 9: Register the new providers in `DatabaseModule`**

Edit `src/database/database.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '@database/prisma.module';
import { DatabaseService } from '@database/database.service';
import { UsersDbRepository } from '@database/users/users.db-repository';
import { UsersDbService } from '@database/users/users.db-service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [DatabaseService, UsersDbRepository, UsersDbService],
  exports: [DatabaseService, UsersDbService],
})
export class DatabaseModule {}
```

- [ ] **Step 10: Swap `UsersService` to use `UsersDbService`**

Replace the full contents of `src/modules/users/users.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { UsersDbService } from '@database/users/users.db-service';
import { UpdateUserDto } from './dto/update-user.dto';
import { ErrorException } from '@errors/types/error-exception';

/** User object without the passwordHash field */
export type SafeUser = Omit<User, 'passwordHash'>;

@Injectable()
export class UsersService {
  constructor(private readonly usersDb: UsersDbService) {}

  async getProfile(userId: string): Promise<SafeUser> {
    const user = await this.usersDb.findById(userId);
    if (!user || user.deletedAt) {
      throw ErrorException.notFound('User', userId);
    }
    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }

  async updateProfile(userId: string, dto: UpdateUserDto): Promise<SafeUser> {
    const user = await this.usersDb.findById(userId);
    if (!user || user.deletedAt) {
      throw ErrorException.notFound('User', userId);
    }
    const updated = await this.usersDb.updateProfile(userId, {
      firstName: dto.firstName,
      lastName: dto.lastName,
    });
    const { passwordHash: _, ...safeUser } = updated;
    return safeUser;
  }
}
```

- [ ] **Step 11: Remove `UsersRepository` provider from `UsersModule`**

Edit `src/modules/users/users.module.ts`: drop the `UsersRepository` entry from `providers` and its import. If `UsersRepository` was listed in `exports`, remove it too.

- [ ] **Step 12: Swap `AuthService` to use `UsersDbService`**

Apply these minimal edits inside `src/modules/auth/auth.service.ts`:

a) Update the imports block — remove `UsersRepository`, add `UsersDbService`:

```ts
// remove: import { UsersRepository } from '@modules/users/users.repository';
import { UsersDbService } from '@database/users/users.db-service';
```

b) Update the constructor:

```ts
constructor(
  private readonly config: AppConfigService,
  private readonly jwtService: JwtService,
  private readonly prisma: PrismaService,
  private readonly usersDb: UsersDbService,
) {}
```

c) Rename every call inside `AuthService`:

| Before                                                                                            | After                                                                                                                                  |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `this.usersRepository.findByEmail(dto.email)`                                                     | `this.usersDb.findActiveByEmail(dto.email)`                                                                                            |
| `this.usersRepository.findUnique({ id: userId })`                                                 | `this.usersDb.findById(userId)`                                                                                                        |
| `this.usersRepository.create({ email, passwordHash, firstName, lastName, status })`               | `this.usersDb.create({ email: dto.email, passwordHash, firstName: dto.firstName, lastName: dto.lastName, status: UserStatus.ACTIVE })` |
| `this.usersRepository.update({ id: user.id }, { failedLoginCount: newFailedCount, lockedUntil })` | `this.usersDb.recordFailedLogin(user.id, { count: newFailedCount, lockedUntil })`                                                      |
| `this.usersRepository.update({ id: user.id }, { failedLoginCount: newFailedCount })`              | `this.usersDb.recordFailedLogin(user.id, { count: newFailedCount })`                                                                   |
| `this.usersRepository.update({ id: user.id }, { failedLoginCount: 0, lockedUntil: null })`        | `this.usersDb.resetFailedLogin(user.id)`                                                                                               |
| `this.usersRepository.update({ id: userId }, { passwordHash: newHash })`                          | `this.usersDb.updatePassword(userId, newHash)`                                                                                         |

(The `this.prisma.refreshToken.*` and `this.prisma.refreshToken.updateMany(...)` calls stay as-is for now — they'll be migrated in Task 5.)

- [ ] **Step 13: Remove `UsersRepository` provider from `AuthModule`**

Edit `src/modules/auth/auth.module.ts`: drop `UsersRepository` from `providers` and from imports.

- [ ] **Step 14: Update `auth.service.spec.ts`**

Edit `test/unit/auth/auth.service.spec.ts` — replace the `UsersRepository` mock provider with a `UsersDbService` mock providing the methods `findActiveByEmail`, `findById`, `create`, `recordFailedLogin`, `resetFailedLogin`, `updatePassword`. Update assertion sites that previously expected `usersRepository.update(...)` calls; assert the new methods (`recordFailedLogin`, `resetFailedLogin`, `updatePassword`) instead.

Rerun the file:

```bash
npx jest test/unit/auth/auth.service.spec.ts
```

Expected: PASS. If test assertions reference Prisma `where` shapes, rewrite them to assert the new method signatures above.

- [ ] **Step 15: Delete the old repository**

```bash
git rm src/modules/users/users.repository.ts
```

- [ ] **Step 16: Verify the whole suite**

Run: `npm run type:check && npm test`
Expected: all pass. Grep check:

```bash
grep -n "@modules/users/users.repository" src/ test/ -r
```

Expected: no matches.

- [ ] **Step 17: Commit**

```bash
git add -A
git commit -m "refactor(db): introduce users aggregate DbService and retire UsersRepository"
```

---

## Task 5: Migrate `auth-credentials/` aggregate (RefreshToken + ApiKey)

**Files:**

- Create: `src/database/auth-credentials/auth-credentials.db-repository.ts`
- Create: `src/database/auth-credentials/auth-credentials.db-service.ts`
- Create: `test/unit/database/auth-credentials/auth-credentials.db-repository.spec.ts`
- Create: `test/unit/database/auth-credentials/auth-credentials.db-service.spec.ts`
- Modify: `src/database/database.module.ts` — register the two new providers, export the service
- Modify: `src/modules/auth/auth.service.ts` — replace `prisma.refreshToken.*` with `AuthCredentialsDbService` methods
- Modify: `src/modules/auth/api-keys.service.ts` — replace `prisma.apiKey.*` with `AuthCredentialsDbService` methods
- Modify: `src/modules/auth/auth.module.ts` — no provider change needed (DatabaseModule is global)
- Modify: `test/unit/auth/auth.service.spec.ts` — mock `AuthCredentialsDbService` instead of raw prisma.refreshToken
- Modify: `test/helpers/mock-prisma.ts` — not needed (still good for DB repo tests)

### New DB-service API

**RefreshToken methods:**

| Old call site                                                                                             | New call (on `AuthCredentialsDbService`)                                             |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `prisma.refreshToken.create({ data: { token, userId, expiresAt } })`                                      | `issueRefreshToken({ token, userId, expiresAt })` → `RefreshToken`                   |
| `prisma.refreshToken.findUnique({ where: { token }, include: { user: true } })`                           | `findRefreshTokenByValueWithUser(token)` → `(RefreshToken & { user: User }) \| null` |
| `prisma.refreshToken.update({ where: { id }, data: { revokedAt: new Date() } })`                          | `revokeRefreshToken(id)`                                                             |
| `prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })` | `revokeAllActiveRefreshTokensForUser(userId)` → `{ count: number }`                  |

**ApiKey methods:**

| Old call                                                                               | New call                                                                                     |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `prisma.apiKey.create({ data: { name, keyHash, prefix, userId, status, expiresAt } })` | `createApiKey(userId, input)` — `input: { name; keyHash; prefix; expiresAt?: Date \| null }` |
| `prisma.apiKey.findMany({ where: { userId }, select: {...}, orderBy })`                | `findApiKeysByUserId(userId)` — returns the same 7-field projection (see type below)         |
| `prisma.apiKey.findFirst({ where: { id, userId } })`                                   | `findApiKeyByIdForUser(userId, keyId)`                                                       |
| `prisma.apiKey.update({ where: { id }, data: { status: REVOKED } })`                   | `revokeApiKey(keyId)`                                                                        |

The list projection type:

```ts
export type ApiKeyListProjection = Pick<
  ApiKey,
  'id' | 'name' | 'prefix' | 'status' | 'lastUsedAt' | 'expiresAt' | 'createdAt'
>;
```

(Same shape as existing `ApiKeyListItem` in `api-keys.service.ts` — keep that export in the feature service and use this alias internally.)

- [ ] **Step 1: Write the failing `AuthCredentialsDbRepository` test**

```ts
// test/unit/database/auth-credentials/auth-credentials.db-repository.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeyStatus } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { AuthCredentialsDbRepository } from '@database/auth-credentials/auth-credentials.db-repository';
import { createMockPrisma } from '../../../helpers/mock-prisma';

describe('AuthCredentialsDbRepository', () => {
  let repo: AuthCredentialsDbRepository;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthCredentialsDbRepository, { provide: PrismaService, useValue: prisma }],
    }).compile();
    repo = module.get(AuthCredentialsDbRepository);
  });

  describe('refresh tokens', () => {
    it('issueRefreshToken creates with token/userId/expiresAt', async () => {
      const exp = new Date('2026-05-01');
      prisma.refreshToken.create.mockResolvedValue({ id: 'rt1' });

      await repo.issueRefreshToken({ token: 't', userId: 'u1', expiresAt: exp });

      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: { token: 't', userId: 'u1', expiresAt: exp },
      });
    });

    it('findRefreshTokenByValueWithUser queries by token and includes user', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({ id: 'rt1', user: { id: 'u1' } });

      await repo.findRefreshTokenByValueWithUser('tok');

      expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith({
        where: { token: 'tok' },
        include: { user: true },
      });
    });

    it('revokeRefreshToken sets revokedAt', async () => {
      prisma.refreshToken.update.mockResolvedValue({ id: 'rt1' });
      await repo.revokeRefreshToken('rt1');
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt1' },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('revokeAllActiveRefreshTokensForUser filters by userId and revokedAt null', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });

      const r = await repo.revokeAllActiveRefreshTokensForUser('u1');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(r).toEqual({ count: 2 });
    });
  });

  describe('api keys', () => {
    it('createApiKey creates with userId and ACTIVE status', async () => {
      prisma.apiKey.create.mockResolvedValue({ id: 'k1' });

      await repo.createApiKey('u1', {
        name: 'n',
        keyHash: 'h',
        prefix: 'p',
        expiresAt: null,
      });

      expect(prisma.apiKey.create).toHaveBeenCalledWith({
        data: {
          name: 'n',
          keyHash: 'h',
          prefix: 'p',
          userId: 'u1',
          status: ApiKeyStatus.ACTIVE,
          expiresAt: null,
        },
      });
    });

    it('findApiKeysByUserId selects the list projection and orders by createdAt desc', async () => {
      prisma.apiKey.findMany.mockResolvedValue([]);

      await repo.findApiKeysByUserId('u1');

      expect(prisma.apiKey.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        select: {
          id: true,
          name: true,
          prefix: true,
          status: true,
          lastUsedAt: true,
          expiresAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('findApiKeyByIdForUser queries by id+userId', async () => {
      prisma.apiKey.findFirst.mockResolvedValue(null);
      await repo.findApiKeyByIdForUser('u1', 'k1');
      expect(prisma.apiKey.findFirst).toHaveBeenCalledWith({
        where: { id: 'k1', userId: 'u1' },
      });
    });

    it('revokeApiKey sets status to REVOKED', async () => {
      prisma.apiKey.update.mockResolvedValue({ id: 'k1' });
      await repo.revokeApiKey('k1');
      expect(prisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: 'k1' },
        data: { status: ApiKeyStatus.REVOKED },
      });
    });
  });
});
```

- [ ] **Step 2: Run — confirm fail**

Run: `npx jest test/unit/database/auth-credentials/`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the repository**

```ts
// src/database/auth-credentials/auth-credentials.db-repository.ts
import { Injectable } from '@nestjs/common';
import { ApiKey, ApiKeyStatus, Prisma, RefreshToken, User } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { BaseRepository } from '@database/base.repository';
import { DbTransactionClient } from '@database/types';

export type ApiKeyListProjection = Pick<
  ApiKey,
  'id' | 'name' | 'prefix' | 'status' | 'lastUsedAt' | 'expiresAt' | 'createdAt'
>;

/**
 * Repository for RefreshToken + ApiKey. BaseRepository is typed for the
 * primary model (RefreshToken); ApiKey methods are explicit named methods.
 */
@Injectable()
export class AuthCredentialsDbRepository extends BaseRepository<
  RefreshToken,
  Prisma.RefreshTokenCreateInput,
  Prisma.RefreshTokenUpdateInput,
  Prisma.RefreshTokenWhereUniqueInput,
  Prisma.RefreshTokenWhereInput,
  Prisma.RefreshTokenOrderByWithRelationInput
> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  protected delegateFor(client: PrismaService | DbTransactionClient) {
    return client.refreshToken;
  }

  // ─── Refresh tokens ──────────────────────────────────────────────

  async issueRefreshToken(
    input: { token: string; userId: string; expiresAt: Date },
    tx?: DbTransactionClient,
  ): Promise<RefreshToken> {
    return this.client(tx).refreshToken.create({ data: input });
  }

  async findRefreshTokenByValueWithUser(
    token: string,
    tx?: DbTransactionClient,
  ): Promise<(RefreshToken & { user: User }) | null> {
    return this.client(tx).refreshToken.findUnique({
      where: { token },
      include: { user: true },
    }) as Promise<(RefreshToken & { user: User }) | null>;
  }

  async revokeRefreshToken(id: string, tx?: DbTransactionClient): Promise<RefreshToken> {
    return this.client(tx).refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllActiveRefreshTokensForUser(
    userId: string,
    tx?: DbTransactionClient,
  ): Promise<{ count: number }> {
    return this.client(tx).refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // ─── API keys ────────────────────────────────────────────────────

  async createApiKey(
    userId: string,
    input: { name: string; keyHash: string; prefix: string; expiresAt?: Date | null },
    tx?: DbTransactionClient,
  ): Promise<ApiKey> {
    return this.client(tx).apiKey.create({
      data: {
        name: input.name,
        keyHash: input.keyHash,
        prefix: input.prefix,
        userId,
        status: ApiKeyStatus.ACTIVE,
        expiresAt: input.expiresAt ?? null,
      },
    });
  }

  async findApiKeysByUserId(
    userId: string,
    tx?: DbTransactionClient,
  ): Promise<ApiKeyListProjection[]> {
    return this.client(tx).apiKey.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        prefix: true,
        status: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findApiKeyByIdForUser(
    userId: string,
    keyId: string,
    tx?: DbTransactionClient,
  ): Promise<ApiKey | null> {
    return this.client(tx).apiKey.findFirst({
      where: { id: keyId, userId },
    });
  }

  async revokeApiKey(keyId: string, tx?: DbTransactionClient): Promise<ApiKey> {
    return this.client(tx).apiKey.update({
      where: { id: keyId },
      data: { status: ApiKeyStatus.REVOKED },
    });
  }
}
```

- [ ] **Step 4: Run the repository test to verify PASS**

Run: `npx jest test/unit/database/auth-credentials/auth-credentials.db-repository.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing DB-service test**

```ts
// test/unit/database/auth-credentials/auth-credentials.db-service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { AuthCredentialsDbRepository } from '@database/auth-credentials/auth-credentials.db-repository';
import { AuthCredentialsDbService } from '@database/auth-credentials/auth-credentials.db-service';

describe('AuthCredentialsDbService', () => {
  let service: AuthCredentialsDbService;
  let repo: jest.Mocked<AuthCredentialsDbRepository>;

  beforeEach(async () => {
    const repoMock: Partial<jest.Mocked<AuthCredentialsDbRepository>> = {
      issueRefreshToken: jest.fn(),
      findRefreshTokenByValueWithUser: jest.fn(),
      revokeRefreshToken: jest.fn(),
      revokeAllActiveRefreshTokensForUser: jest.fn(),
      createApiKey: jest.fn(),
      findApiKeysByUserId: jest.fn(),
      findApiKeyByIdForUser: jest.fn(),
      revokeApiKey: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthCredentialsDbService,
        { provide: AuthCredentialsDbRepository, useValue: repoMock },
      ],
    }).compile();

    service = module.get(AuthCredentialsDbService);
    repo = module.get(AuthCredentialsDbRepository);
  });

  it('issueRefreshToken delegates', async () => {
    await service.issueRefreshToken({ token: 't', userId: 'u1', expiresAt: new Date(0) });
    expect(repo.issueRefreshToken).toHaveBeenCalled();
  });

  it('revokeAllActiveRefreshTokensForUser delegates', async () => {
    repo.revokeAllActiveRefreshTokensForUser.mockResolvedValue({ count: 3 });
    const r = await service.revokeAllActiveRefreshTokensForUser('u1');
    expect(r).toEqual({ count: 3 });
    expect(repo.revokeAllActiveRefreshTokensForUser).toHaveBeenCalledWith('u1', undefined);
  });

  it('createApiKey delegates with userId', async () => {
    await service.createApiKey('u1', { name: 'n', keyHash: 'h', prefix: 'p' });
    expect(repo.createApiKey).toHaveBeenCalledWith(
      'u1',
      { name: 'n', keyHash: 'h', prefix: 'p' },
      undefined,
    );
  });
});
```

- [ ] **Step 6: Implement the service**

```ts
// src/database/auth-credentials/auth-credentials.db-service.ts
import { Injectable } from '@nestjs/common';
import { ApiKey, RefreshToken, User } from '@prisma/client';
import {
  AuthCredentialsDbRepository,
  ApiKeyListProjection,
} from '@database/auth-credentials/auth-credentials.db-repository';
import { DbTransactionClient } from '@database/types';

export type { ApiKeyListProjection };

@Injectable()
export class AuthCredentialsDbService {
  constructor(private readonly repo: AuthCredentialsDbRepository) {}

  // ─── Refresh tokens ──────────────────────────────────────────────

  issueRefreshToken(
    input: { token: string; userId: string; expiresAt: Date },
    tx?: DbTransactionClient,
  ): Promise<RefreshToken> {
    return this.repo.issueRefreshToken(input, tx);
  }

  findRefreshTokenByValueWithUser(
    token: string,
    tx?: DbTransactionClient,
  ): Promise<(RefreshToken & { user: User }) | null> {
    return this.repo.findRefreshTokenByValueWithUser(token, tx);
  }

  revokeRefreshToken(id: string, tx?: DbTransactionClient): Promise<RefreshToken> {
    return this.repo.revokeRefreshToken(id, tx);
  }

  revokeAllActiveRefreshTokensForUser(
    userId: string,
    tx?: DbTransactionClient,
  ): Promise<{ count: number }> {
    return this.repo.revokeAllActiveRefreshTokensForUser(userId, tx);
  }

  // ─── API keys ────────────────────────────────────────────────────

  createApiKey(
    userId: string,
    input: { name: string; keyHash: string; prefix: string; expiresAt?: Date | null },
    tx?: DbTransactionClient,
  ): Promise<ApiKey> {
    return this.repo.createApiKey(userId, input, tx);
  }

  findApiKeysByUserId(userId: string, tx?: DbTransactionClient): Promise<ApiKeyListProjection[]> {
    return this.repo.findApiKeysByUserId(userId, tx);
  }

  findApiKeyByIdForUser(
    userId: string,
    keyId: string,
    tx?: DbTransactionClient,
  ): Promise<ApiKey | null> {
    return this.repo.findApiKeyByIdForUser(userId, keyId, tx);
  }

  revokeApiKey(keyId: string, tx?: DbTransactionClient): Promise<ApiKey> {
    return this.repo.revokeApiKey(keyId, tx);
  }
}
```

- [ ] **Step 7: Run the DB-service test to verify PASS**

Run: `npx jest test/unit/database/auth-credentials/`
Expected: PASS.

- [ ] **Step 8: Register in `DatabaseModule`**

Add both new classes to `providers` and `AuthCredentialsDbService` to `exports`:

```ts
import { AuthCredentialsDbRepository } from '@database/auth-credentials/auth-credentials.db-repository';
import { AuthCredentialsDbService } from '@database/auth-credentials/auth-credentials.db-service';
// providers: [..., AuthCredentialsDbRepository, AuthCredentialsDbService]
// exports:   [..., AuthCredentialsDbService]
```

- [ ] **Step 9: Swap `AuthService` to use `AuthCredentialsDbService`**

Edit `src/modules/auth/auth.service.ts`:

a) Imports — remove `PrismaService` and add `AuthCredentialsDbService`:

```ts
// remove: import { PrismaService } from '@database/prisma.service';
import { AuthCredentialsDbService } from '@database/auth-credentials/auth-credentials.db-service';
```

b) Constructor:

```ts
constructor(
  private readonly config: AppConfigService,
  private readonly jwtService: JwtService,
  private readonly usersDb: UsersDbService,
  private readonly authCredentialsDb: AuthCredentialsDbService,
) {}
```

c) Replace each direct Prisma call:

| Before                                                                                                         | After                                                                                           |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `this.prisma.refreshToken.findUnique({ where: { token }, include: { user: true } })`                           | `this.authCredentialsDb.findRefreshTokenByValueWithUser(token)`                                 |
| `this.prisma.refreshToken.update({ where: { id: refreshToken.id }, data: { revokedAt: new Date() } })`         | `this.authCredentialsDb.revokeRefreshToken(refreshToken.id)`                                    |
| `this.prisma.refreshToken.create({ data: { token: refreshToken, userId: user.id, expiresAt } })`               | `this.authCredentialsDb.issueRefreshToken({ token: refreshToken, userId: user.id, expiresAt })` |
| `this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })` | `this.authCredentialsDb.revokeAllActiveRefreshTokensForUser(userId)`                            |

- [ ] **Step 10: Swap `ApiKeysService` to use `AuthCredentialsDbService`**

Replace `src/modules/auth/api-keys.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { ApiKey } from '@prisma/client';
import { AuthCredentialsDbService } from '@database/auth-credentials/auth-credentials.db-service';
import { API_KEY_PREFIX_LENGTH } from '@common/constants';
import { ErrorException } from '@errors/types/error-exception';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

export type ApiKeyListItem = Pick<
  ApiKey,
  'id' | 'name' | 'prefix' | 'status' | 'lastUsedAt' | 'expiresAt' | 'createdAt'
>;

export interface CreateApiKeyResult {
  id: string;
  name: string;
  key: string;
  prefix: string;
  createdAt: Date;
}

@Injectable()
export class ApiKeysService {
  constructor(private readonly authCredentialsDb: AuthCredentialsDbService) {}

  async create(userId: string, dto: CreateApiKeyDto): Promise<CreateApiKeyResult> {
    const rawKey = crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const prefix = rawKey.slice(0, API_KEY_PREFIX_LENGTH);

    const apiKey = await this.authCredentialsDb.createApiKey(userId, {
      name: dto.name,
      keyHash,
      prefix,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
    });

    return {
      id: apiKey.id,
      name: apiKey.name,
      key: rawKey,
      prefix: apiKey.prefix,
      createdAt: apiKey.createdAt,
    };
  }

  async findAll(userId: string): Promise<ApiKeyListItem[]> {
    return this.authCredentialsDb.findApiKeysByUserId(userId);
  }

  async revoke(userId: string, keyId: string): Promise<void> {
    const apiKey = await this.authCredentialsDb.findApiKeyByIdForUser(userId, keyId);
    if (!apiKey) {
      throw ErrorException.notFound('ApiKey', keyId);
    }
    await this.authCredentialsDb.revokeApiKey(keyId);
  }
}
```

- [ ] **Step 11: Update `test/unit/auth/auth.service.spec.ts`**

Replace the raw `PrismaService` mock with an `AuthCredentialsDbService` mock. Assertions that previously watched `prisma.refreshToken.create` etc. now watch the new methods (`issueRefreshToken`, `revokeRefreshToken`, `findRefreshTokenByValueWithUser`, `revokeAllActiveRefreshTokensForUser`). Run:

```bash
npx jest test/unit/auth/auth.service.spec.ts
```

Expected: PASS after assertion rewrites.

- [ ] **Step 12: Verify**

Run: `npm run type:check && npm test`
Then:

```bash
grep -n "this.prisma\." src/modules/auth/
```

Expected: no matches (all prisma calls migrated).

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "refactor(db): introduce auth-credentials aggregate DbService for RefreshToken+ApiKey"
```

---

## Task 6: Migrate `todo-lists/` aggregate

**Files:**

- Create: `src/database/todo-lists/todo-lists.db-repository.ts`
- Create: `src/database/todo-lists/todo-lists.db-service.ts`
- Create: `test/unit/database/todo-lists/todo-lists.db-repository.spec.ts`
- Create: `test/unit/database/todo-lists/todo-lists.db-service.spec.ts`
- Modify: `src/database/database.module.ts`
- Modify: `src/modules/todo-lists/todo-lists.service.ts` — inject `TodoListsDbService`
- Modify: `src/modules/todo-lists/todo-lists.module.ts` — drop `TodoListsRepository` provider
- Modify: `test/unit/todo-lists/todo-lists.service.spec.ts`
- Delete: `src/modules/todo-lists/todo-lists.repository.ts`

### New DB-service API

| Old call                                                                                | New call                                                            |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `todoListsRepository.create({ title, description, user: { connect: { id: userId } } })` | `createForUser(userId, { title, description? })`                    |
| `todoListsRepository.findByUserId(userId, pagination)`                                  | `findActiveByUserId(userId, pagination)`                            |
| `todoListsRepository.findFirst({ id, userId, deletedAt: null })`                        | `findByIdForUser(userId, id)` → `TodoList \| null`                  |
| `todoListsRepository.update({ id }, dto)`                                               | `updateById(id, patch)` (ownership pre-verified in feature service) |
| `todoListsRepository.softDelete({ id })`                                                | `softDeleteById(id)`                                                |

- [ ] **Step 1: Write the failing repository test**

```ts
// test/unit/database/todo-lists/todo-lists.db-repository.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@database/prisma.service';
import { TodoListsDbRepository } from '@database/todo-lists/todo-lists.db-repository';
import { createMockPrisma } from '../../../helpers/mock-prisma';

describe('TodoListsDbRepository', () => {
  let repo: TodoListsDbRepository;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [TodoListsDbRepository, { provide: PrismaService, useValue: prisma }],
    }).compile();
    repo = module.get(TodoListsDbRepository);
  });

  it('createForUser connects the list to the user', async () => {
    prisma.todoList.create.mockResolvedValue({ id: 'l1' });
    await repo.createForUser('u1', { title: 'T', description: 'D' });
    expect(prisma.todoList.create).toHaveBeenCalledWith({
      data: { title: 'T', description: 'D', user: { connect: { id: 'u1' } } },
    });
  });

  it('findByIdForUser filters by id + userId + non-deleted', async () => {
    prisma.todoList.findFirst.mockResolvedValue({ id: 'l1' });
    await repo.findByIdForUser('u1', 'l1');
    expect(prisma.todoList.findFirst).toHaveBeenCalledWith({
      where: { id: 'l1', userId: 'u1', deletedAt: null },
    });
  });

  it('findActiveByUserId delegates to findManyPaginated with soft-delete filter', async () => {
    prisma.todoList.findMany.mockResolvedValue([]);
    prisma.todoList.count.mockResolvedValue(0);
    await repo.findActiveByUserId('u1', { page: 1, limit: 10 });
    expect(prisma.todoList.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', deletedAt: null } }),
    );
  });

  it('updateById updates by id', async () => {
    prisma.todoList.update.mockResolvedValue({ id: 'l1' });
    await repo.updateById('l1', { title: 'x' });
    expect(prisma.todoList.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { title: 'x' },
    });
  });

  it('softDeleteById sets deletedAt', async () => {
    prisma.todoList.update.mockResolvedValue({ id: 'l1' });
    await repo.softDeleteById('l1');
    expect(prisma.todoList.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { deletedAt: expect.any(Date) },
    });
  });
});
```

- [ ] **Step 2: Confirm it fails**

Run: `npx jest test/unit/database/todo-lists/`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the repository**

```ts
// src/database/todo-lists/todo-lists.db-repository.ts
import { Injectable } from '@nestjs/common';
import { Prisma, TodoList } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { BaseRepository } from '@database/base.repository';
import { DbTransactionClient } from '@database/types';
import { PaginationParams, PaginatedResult } from '@common/interfaces';

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

  async createForUser(
    userId: string,
    input: { title: string; description?: string | null },
    tx?: DbTransactionClient,
  ): Promise<TodoList> {
    return this.client(tx).todoList.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        user: { connect: { id: userId } },
      },
    });
  }

  async findActiveByUserId(
    userId: string,
    pagination: PaginationParams,
    tx?: DbTransactionClient,
  ): Promise<PaginatedResult<TodoList>> {
    return this.findManyPaginated(pagination, { userId, deletedAt: null }, undefined, tx);
  }

  async findByIdForUser(
    userId: string,
    id: string,
    tx?: DbTransactionClient,
  ): Promise<TodoList | null> {
    return this.client(tx).todoList.findFirst({
      where: { id, userId, deletedAt: null },
    });
  }

  async updateById(
    id: string,
    patch: { title?: string; description?: string | null },
    tx?: DbTransactionClient,
  ): Promise<TodoList> {
    return this.client(tx).todoList.update({ where: { id }, data: patch });
  }

  async softDeleteById(id: string, tx?: DbTransactionClient): Promise<TodoList> {
    return this.client(tx).todoList.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
```

- [ ] **Step 4: Run the repository test — PASS**

Run: `npx jest test/unit/database/todo-lists/todo-lists.db-repository.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write the DB-service test**

```ts
// test/unit/database/todo-lists/todo-lists.db-service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { TodoListsDbRepository } from '@database/todo-lists/todo-lists.db-repository';
import { TodoListsDbService } from '@database/todo-lists/todo-lists.db-service';

describe('TodoListsDbService', () => {
  let service: TodoListsDbService;
  let repo: jest.Mocked<TodoListsDbRepository>;

  beforeEach(async () => {
    const repoMock: Partial<jest.Mocked<TodoListsDbRepository>> = {
      createForUser: jest.fn(),
      findActiveByUserId: jest.fn(),
      findByIdForUser: jest.fn(),
      updateById: jest.fn(),
      softDeleteById: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [TodoListsDbService, { provide: TodoListsDbRepository, useValue: repoMock }],
    }).compile();
    service = module.get(TodoListsDbService);
    repo = module.get(TodoListsDbRepository);
  });

  it('createForUser delegates', async () => {
    await service.createForUser('u1', { title: 't' });
    expect(repo.createForUser).toHaveBeenCalledWith('u1', { title: 't' }, undefined);
  });
});
```

- [ ] **Step 6: Implement the service**

```ts
// src/database/todo-lists/todo-lists.db-service.ts
import { Injectable } from '@nestjs/common';
import { TodoList } from '@prisma/client';
import { TodoListsDbRepository } from '@database/todo-lists/todo-lists.db-repository';
import { DbTransactionClient } from '@database/types';
import { PaginationParams, PaginatedResult } from '@common/interfaces';

@Injectable()
export class TodoListsDbService {
  constructor(private readonly repo: TodoListsDbRepository) {}

  createForUser(
    userId: string,
    input: { title: string; description?: string | null },
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

  updateById(
    id: string,
    patch: { title?: string; description?: string | null },
    tx?: DbTransactionClient,
  ): Promise<TodoList> {
    return this.repo.updateById(id, patch, tx);
  }

  softDeleteById(id: string, tx?: DbTransactionClient): Promise<TodoList> {
    return this.repo.softDeleteById(id, tx);
  }
}
```

- [ ] **Step 7: Run service test — PASS**

Run: `npx jest test/unit/database/todo-lists/`
Expected: all PASS.

- [ ] **Step 8: Register providers in `DatabaseModule`**

Add `TodoListsDbRepository` + `TodoListsDbService` to providers; `TodoListsDbService` to exports.

- [ ] **Step 9: Swap `TodoListsService`**

Replace `src/modules/todo-lists/todo-lists.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { TodoList } from '@prisma/client';
import { TodoListsDbService } from '@database/todo-lists/todo-lists.db-service';
import { CreateTodoListDto } from './dto/create-todo-list.dto';
import { UpdateTodoListDto } from './dto/update-todo-list.dto';
import { PaginationParams, PaginatedResult } from '@common/interfaces';
import { ErrorException } from '@errors/types/error-exception';

@Injectable()
export class TodoListsService {
  constructor(private readonly todoListsDb: TodoListsDbService) {}

  async create(userId: string, dto: CreateTodoListDto): Promise<TodoList> {
    return this.todoListsDb.createForUser(userId, {
      title: dto.title,
      description: dto.description,
    });
  }

  async findAll(userId: string, params: PaginationParams): Promise<PaginatedResult<TodoList>> {
    return this.todoListsDb.findActiveByUserId(userId, params);
  }

  async findOne(userId: string, id: string): Promise<TodoList> {
    const list = await this.todoListsDb.findByIdForUser(userId, id);
    if (!list) {
      throw ErrorException.notFound('TodoList', id);
    }
    return list;
  }

  async update(userId: string, id: string, dto: UpdateTodoListDto): Promise<TodoList> {
    await this.findOne(userId, id);
    return this.todoListsDb.updateById(id, {
      title: dto.title,
      description: dto.description,
    });
  }

  async remove(userId: string, id: string): Promise<TodoList> {
    await this.findOne(userId, id);
    return this.todoListsDb.softDeleteById(id);
  }
}
```

- [ ] **Step 10: Remove `TodoListsRepository` from `TodoListsModule`**

In `src/modules/todo-lists/todo-lists.module.ts`, remove `TodoListsRepository` from both `providers` and `exports`, and drop its import line.

- [ ] **Step 11: Update `test/unit/todo-lists/todo-lists.service.spec.ts`**

Swap `TodoListsRepository` mock → `TodoListsDbService` mock with methods `createForUser`, `findActiveByUserId`, `findByIdForUser`, `updateById`, `softDeleteById`. Rewrite assertions that expected raw `findByUserId`/`findFirst`/etc. to the new signatures.

Run: `npx jest test/unit/todo-lists/`
Expected: PASS.

- [ ] **Step 12: Delete the old repository**

```bash
git rm src/modules/todo-lists/todo-lists.repository.ts
```

- [ ] **Step 13: Verify**

Run: `npm run type:check && npm test`
Expected: all pass.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "refactor(db): introduce todo-lists aggregate DbService"
```

---

## Task 7: Migrate `todo-items/` aggregate (TodoItem + TodoItemTag)

**Files:**

- Create: `src/database/todo-items/todo-items.db-repository.ts`
- Create: `src/database/todo-items/todo-items.db-service.ts`
- Create: `test/unit/database/todo-items/todo-items.db-repository.spec.ts`
- Create: `test/unit/database/todo-items/todo-items.db-service.spec.ts`
- Modify: `src/database/database.module.ts`
- Modify: `src/modules/todo-items/todo-items.service.ts`
- Modify: `src/modules/todo-items/todo-items.module.ts`
- Modify: `test/unit/todo-items/todo-items.service.spec.ts`
- Delete: `src/modules/todo-items/todo-items.repository.ts`

### New DB-service API

**TodoItem:**

| Old call                                                                                                       | New call                                                 |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `todoItemsRepository.create({ title, description, priority, dueDate, todoList: { connect: { id: listId } } })` | `createInList(listId, input)`                            |
| `todoItemsRepository.findByListId(listId, filters, pagination)`                                                | `findByListId(listId, filters, pagination)` (same shape) |
| `todoItemsRepository.findFirst({ id, deletedAt: null, todoList: { userId } })`                                 | `findByIdForUser(userId, id)`                            |
| `todoItemsRepository.update({ id }, updateData)`                                                               | `updateById(id, patch)`                                  |
| `todoItemsRepository.softDelete({ id })`                                                                       | `softDeleteById(id)`                                     |

**TodoItemTag (the secondary model in this aggregate):**

| Old call (from `TagsService`)                                                       | New call                   |
| ----------------------------------------------------------------------------------- | -------------------------- |
| `prisma.todoItemTag.create({ data: { todoItemId, tagId } })`                        | `assignTag(itemId, tagId)` |
| `prisma.todoItemTag.delete({ where: { todoItemId_tagId: { todoItemId, tagId } } })` | `removeTag(itemId, tagId)` |

(`findByIdWithTags` from the old repository is unused — do not port.)

- [ ] **Step 1: Write the failing repository test**

```ts
// test/unit/database/todo-items/todo-items.db-repository.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { TodoPriority, TodoStatus } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { TodoItemsDbRepository } from '@database/todo-items/todo-items.db-repository';
import { createMockPrisma } from '../../../helpers/mock-prisma';

describe('TodoItemsDbRepository', () => {
  let repo: TodoItemsDbRepository;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [TodoItemsDbRepository, { provide: PrismaService, useValue: prisma }],
    }).compile();
    repo = module.get(TodoItemsDbRepository);
  });

  it('createInList connects to the list', async () => {
    prisma.todoItem.create.mockResolvedValue({ id: 'i1' });
    await repo.createInList('l1', {
      title: 't',
      description: 'd',
      priority: TodoPriority.HIGH,
      dueDate: new Date(0),
    });
    expect(prisma.todoItem.create).toHaveBeenCalledWith({
      data: {
        title: 't',
        description: 'd',
        priority: TodoPriority.HIGH,
        dueDate: new Date(0),
        todoList: { connect: { id: 'l1' } },
      },
    });
  });

  it('findByIdForUser scopes via todoList.userId and deletedAt: null', async () => {
    prisma.todoItem.findFirst.mockResolvedValue(null);
    await repo.findByIdForUser('u1', 'i1');
    expect(prisma.todoItem.findFirst).toHaveBeenCalledWith({
      where: { id: 'i1', deletedAt: null, todoList: { userId: 'u1' } },
    });
  });

  it('findByListId applies filters (status, priority, overdue, tagId)', async () => {
    prisma.todoItem.findMany.mockResolvedValue([]);
    prisma.todoItem.count.mockResolvedValue(0);

    await repo.findByListId(
      'l1',
      { status: TodoStatus.PENDING, priority: TodoPriority.HIGH, overdue: true, tagId: 'tag1' },
      { page: 1, limit: 10 },
    );

    expect(prisma.todoItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          todoListId: 'l1',
          deletedAt: null,
          priority: TodoPriority.HIGH,
          dueDate: { lt: expect.any(Date) },
          status: { notIn: ['COMPLETED', 'ARCHIVED'] },
          tags: { some: { tagId: 'tag1' } },
        }),
      }),
    );
  });

  it('assignTag creates a join row', async () => {
    prisma.todoItemTag.create.mockResolvedValue({ todoItemId: 'i1', tagId: 'tag1' });
    await repo.assignTag('i1', 'tag1');
    expect(prisma.todoItemTag.create).toHaveBeenCalledWith({
      data: { todoItemId: 'i1', tagId: 'tag1' },
    });
  });

  it('removeTag deletes the join row via composite key', async () => {
    prisma.todoItemTag.delete.mockResolvedValue({ todoItemId: 'i1', tagId: 'tag1' });
    await repo.removeTag('i1', 'tag1');
    expect(prisma.todoItemTag.delete).toHaveBeenCalledWith({
      where: { todoItemId_tagId: { todoItemId: 'i1', tagId: 'tag1' } },
    });
  });
});
```

- [ ] **Step 2: Confirm fail**

Run: `npx jest test/unit/database/todo-items/`
Expected: FAIL.

- [ ] **Step 3: Implement the repository**

```ts
// src/database/todo-items/todo-items.db-repository.ts
import { Injectable } from '@nestjs/common';
import { Prisma, TodoItem, TodoItemTag, TodoPriority, TodoStatus } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { BaseRepository } from '@database/base.repository';
import { DbTransactionClient } from '@database/types';
import { PaginationParams, PaginatedResult } from '@common/interfaces';

export interface TodoItemFilters {
  status?: TodoStatus;
  priority?: TodoPriority;
  dueDate?: string;
  tagId?: string;
  overdue?: boolean;
}

@Injectable()
export class TodoItemsDbRepository extends BaseRepository<
  TodoItem,
  Prisma.TodoItemCreateInput,
  Prisma.TodoItemUpdateInput,
  Prisma.TodoItemWhereUniqueInput,
  Prisma.TodoItemWhereInput,
  Prisma.TodoItemOrderByWithRelationInput
> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  protected delegateFor(client: PrismaService | DbTransactionClient) {
    return client.todoItem;
  }
  protected supportsSoftDelete = true;

  async createInList(
    listId: string,
    input: {
      title: string;
      description?: string | null;
      priority?: TodoPriority;
      dueDate?: Date | null;
    },
    tx?: DbTransactionClient,
  ): Promise<TodoItem> {
    return this.client(tx).todoItem.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        ...(input.priority ? { priority: input.priority } : {}),
        ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
        todoList: { connect: { id: listId } },
      },
    });
  }

  async findByListId(
    listId: string,
    filters: TodoItemFilters,
    pagination: PaginationParams,
    tx?: DbTransactionClient,
  ): Promise<PaginatedResult<TodoItem>> {
    const where: Prisma.TodoItemWhereInput = {
      todoListId: listId,
      deletedAt: null,
    };

    if (filters.priority) where.priority = filters.priority;
    if (filters.status) where.status = filters.status;
    if (filters.dueDate) where.dueDate = { lte: new Date(filters.dueDate) };
    if (filters.overdue) {
      where.dueDate = { lt: new Date() };
      where.status = { notIn: ['COMPLETED', 'ARCHIVED'] };
    }
    if (filters.tagId) {
      where.tags = {
        some: { tagId: filters.tagId },
      } as Prisma.TodoItemTagListRelationFilter;
    }

    return this.findManyPaginated(pagination, where, undefined, tx);
  }

  async findByIdForUser(
    userId: string,
    id: string,
    tx?: DbTransactionClient,
  ): Promise<TodoItem | null> {
    return this.client(tx).todoItem.findFirst({
      where: { id, deletedAt: null, todoList: { userId } },
    });
  }

  async updateById(
    id: string,
    patch: Partial<{
      title: string;
      description: string | null;
      status: TodoStatus;
      priority: TodoPriority;
      dueDate: Date | null;
      completedAt: Date | null;
    }>,
    tx?: DbTransactionClient,
  ): Promise<TodoItem> {
    return this.client(tx).todoItem.update({ where: { id }, data: patch });
  }

  async softDeleteById(id: string, tx?: DbTransactionClient): Promise<TodoItem> {
    return this.client(tx).todoItem.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // ─── TodoItemTag ──────────────────────────────────────────────

  async assignTag(itemId: string, tagId: string, tx?: DbTransactionClient): Promise<TodoItemTag> {
    return this.client(tx).todoItemTag.create({
      data: { todoItemId: itemId, tagId },
    });
  }

  async removeTag(itemId: string, tagId: string, tx?: DbTransactionClient): Promise<TodoItemTag> {
    return this.client(tx).todoItemTag.delete({
      where: { todoItemId_tagId: { todoItemId: itemId, tagId } },
    });
  }
}
```

- [ ] **Step 4: Run repository test — PASS**

Run: `npx jest test/unit/database/todo-items/todo-items.db-repository.spec.ts`

- [ ] **Step 5: Write service test + implement service**

```ts
// test/unit/database/todo-items/todo-items.db-service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { TodoItemsDbRepository } from '@database/todo-items/todo-items.db-repository';
import { TodoItemsDbService } from '@database/todo-items/todo-items.db-service';

describe('TodoItemsDbService', () => {
  let service: TodoItemsDbService;
  let repo: jest.Mocked<TodoItemsDbRepository>;

  beforeEach(async () => {
    const repoMock: Partial<jest.Mocked<TodoItemsDbRepository>> = {
      createInList: jest.fn(),
      findByListId: jest.fn(),
      findByIdForUser: jest.fn(),
      updateById: jest.fn(),
      softDeleteById: jest.fn(),
      assignTag: jest.fn(),
      removeTag: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [TodoItemsDbService, { provide: TodoItemsDbRepository, useValue: repoMock }],
    }).compile();
    service = module.get(TodoItemsDbService);
    repo = module.get(TodoItemsDbRepository);
  });

  it('createInList delegates', async () => {
    await service.createInList('l1', { title: 't' });
    expect(repo.createInList).toHaveBeenCalledWith('l1', { title: 't' }, undefined);
  });

  it('assignTag delegates', async () => {
    await service.assignTag('i1', 'tag1');
    expect(repo.assignTag).toHaveBeenCalledWith('i1', 'tag1', undefined);
  });
});
```

```ts
// src/database/todo-items/todo-items.db-service.ts
import { Injectable } from '@nestjs/common';
import { TodoItem, TodoItemTag, TodoPriority, TodoStatus } from '@prisma/client';
import {
  TodoItemsDbRepository,
  TodoItemFilters,
} from '@database/todo-items/todo-items.db-repository';
import { DbTransactionClient } from '@database/types';
import { PaginationParams, PaginatedResult } from '@common/interfaces';

export type { TodoItemFilters };

@Injectable()
export class TodoItemsDbService {
  constructor(private readonly repo: TodoItemsDbRepository) {}

  createInList(
    listId: string,
    input: {
      title: string;
      description?: string | null;
      priority?: TodoPriority;
      dueDate?: Date | null;
    },
    tx?: DbTransactionClient,
  ): Promise<TodoItem> {
    return this.repo.createInList(listId, input, tx);
  }

  findByListId(
    listId: string,
    filters: TodoItemFilters,
    pagination: PaginationParams,
    tx?: DbTransactionClient,
  ): Promise<PaginatedResult<TodoItem>> {
    return this.repo.findByListId(listId, filters, pagination, tx);
  }

  findByIdForUser(userId: string, id: string, tx?: DbTransactionClient): Promise<TodoItem | null> {
    return this.repo.findByIdForUser(userId, id, tx);
  }

  updateById(
    id: string,
    patch: Partial<{
      title: string;
      description: string | null;
      status: TodoStatus;
      priority: TodoPriority;
      dueDate: Date | null;
      completedAt: Date | null;
    }>,
    tx?: DbTransactionClient,
  ): Promise<TodoItem> {
    return this.repo.updateById(id, patch, tx);
  }

  softDeleteById(id: string, tx?: DbTransactionClient): Promise<TodoItem> {
    return this.repo.softDeleteById(id, tx);
  }

  assignTag(itemId: string, tagId: string, tx?: DbTransactionClient): Promise<TodoItemTag> {
    return this.repo.assignTag(itemId, tagId, tx);
  }

  removeTag(itemId: string, tagId: string, tx?: DbTransactionClient): Promise<TodoItemTag> {
    return this.repo.removeTag(itemId, tagId, tx);
  }
}
```

Run: `npx jest test/unit/database/todo-items/` — both suites PASS.

- [ ] **Step 6: Register in `DatabaseModule`**

Add `TodoItemsDbRepository` + `TodoItemsDbService` to providers; export `TodoItemsDbService`.

- [ ] **Step 7: Swap `TodoItemsService`**

Replace `src/modules/todo-items/todo-items.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TodoItem, TodoStatus } from '@prisma/client';
import { TodoItemsDbService } from '@database/todo-items/todo-items.db-service';
import { TodoListsService } from '@modules/todo-lists/todo-lists.service';
import { CreateTodoItemDto } from './dto/create-todo-item.dto';
import { UpdateTodoItemDto } from './dto/update-todo-item.dto';
import { QueryTodoItemsDto } from './dto/query-todo-items.dto';
import { VALID_STATUS_TRANSITIONS } from './todo-status.constants';
import { TODO_QUEUE } from '@/queue/queue.module';
import { PaginatedResult } from '@common/interfaces';
import { ErrorException } from '@errors/types/error-exception';
import { VAL } from '@errors/error-codes';

@Injectable()
export class TodoItemsService {
  constructor(
    private readonly todoItemsDb: TodoItemsDbService,
    private readonly todoListsService: TodoListsService,
    @InjectQueue(TODO_QUEUE) private readonly todoQueue: Queue,
  ) {}

  async create(userId: string, listId: string, dto: CreateTodoItemDto): Promise<TodoItem> {
    await this.todoListsService.findOne(userId, listId);

    const item = await this.todoItemsDb.createInList(listId, {
      title: dto.title,
      description: dto.description,
      priority: dto.priority,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
    });

    if (dto.dueDate) {
      await this.todoQueue.add(
        'overdue-check',
        { todoItemId: item.id, type: 'overdue-check' },
        { delay: new Date(dto.dueDate).getTime() - Date.now(), attempts: 3 },
      );
    }

    return item;
  }

  async findAll(
    userId: string,
    listId: string,
    query: QueryTodoItemsDto,
  ): Promise<PaginatedResult<TodoItem>> {
    await this.todoListsService.findOne(userId, listId);

    return this.todoItemsDb.findByListId(
      listId,
      {
        status: query.status,
        priority: query.priority,
        tagId: query.tagId,
        overdue: query.overdue,
      },
      {
        page: query.page,
        limit: query.limit,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      },
    );
  }

  async findOne(userId: string, id: string): Promise<TodoItem> {
    const item = await this.todoItemsDb.findByIdForUser(userId, id);
    if (!item) {
      throw ErrorException.notFound('TodoItem', id);
    }
    return item;
  }

  async update(userId: string, id: string, dto: UpdateTodoItemDto): Promise<TodoItem> {
    const item = await this.findOne(userId, id);

    if (dto.status && dto.status !== item.status) {
      const allowed = VALID_STATUS_TRANSITIONS[item.status] ?? [];
      if (!allowed.includes(dto.status)) {
        throw new ErrorException(VAL.INVALID_STATUS_TRANSITION, {
          message: `Cannot transition from '${item.status}' to '${dto.status}'`,
        });
      }
    }

    const patch: Parameters<typeof this.todoItemsDb.updateById>[1] = {
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
    };

    if (dto.status === TodoStatus.COMPLETED && item.status !== TodoStatus.COMPLETED) {
      patch.completedAt = new Date();
    }
    if (dto.dueDate !== undefined) {
      patch.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    }

    return this.todoItemsDb.updateById(id, patch);
  }

  async remove(userId: string, id: string): Promise<TodoItem> {
    await this.findOne(userId, id);
    return this.todoItemsDb.softDeleteById(id);
  }
}
```

- [ ] **Step 8: Remove `TodoItemsRepository` provider from `TodoItemsModule`**

In `src/modules/todo-items/todo-items.module.ts`, remove the `TodoItemsRepository` provider and its import line.

- [ ] **Step 9: Update `test/unit/todo-items/todo-items.service.spec.ts`**

Replace the `TodoItemsRepository` mock with a `TodoItemsDbService` mock supplying `createInList`, `findByListId`, `findByIdForUser`, `updateById`, `softDeleteById`. Rewrite assertions accordingly.

Run: `npx jest test/unit/todo-items/` — PASS.

- [ ] **Step 10: Delete the old repository file**

```bash
git rm src/modules/todo-items/todo-items.repository.ts
```

- [ ] **Step 11: Verify**

```bash
npm run type:check && npm test
grep -n "this.prisma\." src/modules/
```

Expected: only `src/modules/tags/tags.service.ts` still has direct prisma calls (migrated in next task).

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "refactor(db): introduce todo-items aggregate DbService (TodoItem+TodoItemTag)"
```

---

## Task 8: Migrate `tags/` aggregate

**Files:**

- Create: `src/database/tags/tags.db-repository.ts`
- Create: `src/database/tags/tags.db-service.ts`
- Create: `test/unit/database/tags/tags.db-repository.spec.ts`
- Create: `test/unit/database/tags/tags.db-service.spec.ts`
- Modify: `src/database/database.module.ts`
- Modify: `src/modules/tags/tags.service.ts` — use `TagsDbService` + `TodoItemsDbService` (for the join table)
- Modify: `src/modules/tags/tags.module.ts`
- Delete: `src/modules/tags/tags.repository.ts`

### New DB-service API for `tags/`

| Old call                                 | New call           |
| ---------------------------------------- | ------------------ |
| `tagsRepository.findFirst({ name })`     | `findByName(name)` |
| `tagsRepository.create({ name, color })` | `create(input)`    |
| `tagsRepository.findMany()`              | `findAll()`        |
| `tagsRepository.findUnique({ id })`      | `findById(id)`     |

The `prisma.todoItemTag.*` calls in `TagsService` are handled by `TodoItemsDbService.assignTag` / `.removeTag` (already built in Task 7).

- [ ] **Step 1: Write the failing repository test**

```ts
// test/unit/database/tags/tags.db-repository.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@database/prisma.service';
import { TagsDbRepository } from '@database/tags/tags.db-repository';
import { createMockPrisma } from '../../../helpers/mock-prisma';

describe('TagsDbRepository', () => {
  let repo: TagsDbRepository;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [TagsDbRepository, { provide: PrismaService, useValue: prisma }],
    }).compile();
    repo = module.get(TagsDbRepository);
  });

  it('findByName delegates to findFirst', async () => {
    prisma.tag.findFirst.mockResolvedValue(null);
    await repo.findByName('work');
    expect(prisma.tag.findFirst).toHaveBeenCalledWith({ where: { name: 'work' } });
  });

  it('findById delegates to findUnique', async () => {
    prisma.tag.findUnique.mockResolvedValue(null);
    await repo.findById('t1');
    expect(prisma.tag.findUnique).toHaveBeenCalledWith({ where: { id: 't1' } });
  });

  it('create passes input through', async () => {
    prisma.tag.create.mockResolvedValue({ id: 't1' });
    await repo.createTag({ name: 'n', color: '#fff' });
    expect(prisma.tag.create).toHaveBeenCalledWith({
      data: { name: 'n', color: '#fff' },
    });
  });

  it('findAll returns every tag', async () => {
    prisma.tag.findMany.mockResolvedValue([]);
    await repo.findAll();
    expect(prisma.tag.findMany).toHaveBeenCalledWith({});
  });
});
```

- [ ] **Step 2: Confirm fail**

Run: `npx jest test/unit/database/tags/` → FAIL.

- [ ] **Step 3: Implement the repository**

```ts
// src/database/tags/tags.db-repository.ts
import { Injectable } from '@nestjs/common';
import { Prisma, Tag } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { BaseRepository } from '@database/base.repository';
import { DbTransactionClient } from '@database/types';

@Injectable()
export class TagsDbRepository extends BaseRepository<
  Tag,
  Prisma.TagCreateInput,
  Prisma.TagUpdateInput,
  Prisma.TagWhereUniqueInput,
  Prisma.TagWhereInput,
  Prisma.TagOrderByWithRelationInput
> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  protected delegateFor(client: PrismaService | DbTransactionClient) {
    return client.tag;
  }

  async findByName(name: string, tx?: DbTransactionClient): Promise<Tag | null> {
    return this.client(tx).tag.findFirst({ where: { name } });
  }

  async findById(id: string, tx?: DbTransactionClient): Promise<Tag | null> {
    return this.client(tx).tag.findUnique({ where: { id } });
  }

  async findAll(tx?: DbTransactionClient): Promise<Tag[]> {
    return this.client(tx).tag.findMany({});
  }

  async createTag(
    input: { name: string; color?: string | null },
    tx?: DbTransactionClient,
  ): Promise<Tag> {
    return this.client(tx).tag.create({ data: input });
  }
}
```

- [ ] **Step 4: Run repository test — PASS**

Run: `npx jest test/unit/database/tags/tags.db-repository.spec.ts`

- [ ] **Step 5: Write + implement the service**

```ts
// test/unit/database/tags/tags.db-service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { TagsDbRepository } from '@database/tags/tags.db-repository';
import { TagsDbService } from '@database/tags/tags.db-service';

describe('TagsDbService', () => {
  let service: TagsDbService;
  let repo: jest.Mocked<TagsDbRepository>;

  beforeEach(async () => {
    const repoMock: Partial<jest.Mocked<TagsDbRepository>> = {
      findByName: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      createTag: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [TagsDbService, { provide: TagsDbRepository, useValue: repoMock }],
    }).compile();
    service = module.get(TagsDbService);
    repo = module.get(TagsDbRepository);
  });

  it('create delegates', async () => {
    await service.create({ name: 'n' });
    expect(repo.createTag).toHaveBeenCalledWith({ name: 'n' }, undefined);
  });
});
```

```ts
// src/database/tags/tags.db-service.ts
import { Injectable } from '@nestjs/common';
import { Tag } from '@prisma/client';
import { TagsDbRepository } from '@database/tags/tags.db-repository';
import { DbTransactionClient } from '@database/types';

@Injectable()
export class TagsDbService {
  constructor(private readonly repo: TagsDbRepository) {}

  findByName(name: string, tx?: DbTransactionClient): Promise<Tag | null> {
    return this.repo.findByName(name, tx);
  }

  findById(id: string, tx?: DbTransactionClient): Promise<Tag | null> {
    return this.repo.findById(id, tx);
  }

  findAll(tx?: DbTransactionClient): Promise<Tag[]> {
    return this.repo.findAll(tx);
  }

  create(input: { name: string; color?: string | null }, tx?: DbTransactionClient): Promise<Tag> {
    return this.repo.createTag(input, tx);
  }
}
```

Run: `npx jest test/unit/database/tags/` → PASS.

- [ ] **Step 6: Register providers**

Add `TagsDbRepository` + `TagsDbService` to `DatabaseModule`'s `providers`; export `TagsDbService`.

- [ ] **Step 7: Swap `TagsService`**

Replace `src/modules/tags/tags.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { Tag, TodoItemTag } from '@prisma/client';
import { TagsDbService } from '@database/tags/tags.db-service';
import { TodoItemsDbService } from '@database/todo-items/todo-items.db-service';
import { TodoItemsService } from '@modules/todo-items/todo-items.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { ErrorException } from '@errors/types/error-exception';
import { DAT } from '@errors/error-codes';

@Injectable()
export class TagsService {
  constructor(
    private readonly tagsDb: TagsDbService,
    private readonly todoItemsDb: TodoItemsDbService,
    private readonly todoItemsService: TodoItemsService,
  ) {}

  async create(dto: CreateTagDto): Promise<Tag> {
    const existing = await this.tagsDb.findByName(dto.name);
    if (existing) {
      throw new ErrorException(DAT.UNIQUE_VIOLATION, {
        message: 'Unique constraint violation on field: name',
        details: [{ field: 'name', message: 'Value already exists' }],
      });
    }
    return this.tagsDb.create({ name: dto.name, color: dto.color });
  }

  async findAll(): Promise<Tag[]> {
    return this.tagsDb.findAll();
  }

  async assignToItem(userId: string, itemId: string, tagId: string): Promise<TodoItemTag> {
    await this.todoItemsService.findOne(userId, itemId);
    const tag = await this.tagsDb.findById(tagId);
    if (!tag) {
      throw ErrorException.notFound('Tag', tagId);
    }
    return this.todoItemsDb.assignTag(itemId, tagId);
  }

  async removeFromItem(userId: string, itemId: string, tagId: string): Promise<TodoItemTag> {
    await this.todoItemsService.findOne(userId, itemId);
    return this.todoItemsDb.removeTag(itemId, tagId);
  }
}
```

- [ ] **Step 8: Clean up `TagsModule`**

In `src/modules/tags/tags.module.ts`:

- Drop `TagsRepository` from `providers` and its import.
- Remove any direct `PrismaService` import that's no longer used.

- [ ] **Step 9: Delete the old repository**

```bash
git rm src/modules/tags/tags.repository.ts
```

- [ ] **Step 10: Verify**

```bash
npm run type:check && npm test
grep -rn "this.prisma\." src/modules/
grep -rn "@prisma/client" src/modules/ src/common/ src/bootstrap/
```

Expected:

- `grep this.prisma. src/modules/` → zero matches.
- `@prisma/client` matches only for **type-only** imports of model types (e.g., `import { User } from '@prisma/client'`) in feature services and decorators. No `Prisma.*Input` usage.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "refactor(db): introduce tags aggregate DbService and clear all module-layer prisma calls"
```

---

## Task 9: Wrap `AuthService.register` in a transaction (runInTransaction proof)

**Files:**

- Modify: `src/modules/auth/auth.service.ts` — `register()` uses `DatabaseService.runInTransaction`
- Create: `test/e2e/auth-register-rollback.e2e-spec.ts` — verify rollback on token-issue failure

- [ ] **Step 1: Inject `DatabaseService` into `AuthService`**

Edit `src/modules/auth/auth.service.ts`:

```ts
import { DatabaseService } from '@database/database.service';
// ...
constructor(
  private readonly config: AppConfigService,
  private readonly jwtService: JwtService,
  private readonly usersDb: UsersDbService,
  private readonly authCredentialsDb: AuthCredentialsDbService,
  private readonly databaseService: DatabaseService,
) {}
```

- [ ] **Step 2: Rewrite `register` to run within a transaction**

Replace the body of `register` in `src/modules/auth/auth.service.ts`:

```ts
async register(dto: RegisterDto): Promise<AuthResult> {
  const existing = await this.usersDb.findActiveByEmail(dto.email);
  if (existing) {
    throw new ErrorException(DAT.UNIQUE_VIOLATION, {
      message: 'Email already exists',
      details: [{ field: 'email', message: 'Already registered' }],
    });
  }

  const passwordHash = await this.hashPassword(dto.password);

  const { user, tokens } = await this.databaseService.runInTransaction(async (tx) => {
    const createdUser = await this.usersDb.create(
      {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        status: UserStatus.ACTIVE,
      },
      tx,
    );
    const generated = await this.generateTokens(createdUser, tx);
    return { user: createdUser, tokens: generated };
  });

  const { passwordHash: _, ...safeUser } = user;
  return { user: safeUser, tokens };
}
```

- [ ] **Step 3: Thread `tx?` into `generateTokens`**

Add the import at the top of `src/modules/auth/auth.service.ts` (next to the other `@database/*` imports):

```ts
import { DbTransactionClient } from '@database/types';
```

Then update the `generateTokens` signature and the `issueRefreshToken` call:

```ts
async generateTokens(user: User, tx?: DbTransactionClient): Promise<TokenPair> {
  // ... existing JWT signing ...

  const decoded = this.jwtService.decode(refreshToken) as { exp: number };
  const expiresAt = new Date(decoded.exp * 1000);

  await this.authCredentialsDb.issueRefreshToken(
    { token: refreshToken, userId: user.id, expiresAt },
    tx,
  );

  return { accessToken, refreshToken };
}
```

Also update `login`'s call site to pass no `tx` (unchanged behavior): `await this.generateTokens(user)` stays as-is.

- [ ] **Step 4: Write the E2E rollback test**

```ts
// test/e2e/auth-register-rollback.e2e-spec.ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '@/app.module';
import { PrismaService } from '@database/prisma.service';
import { AuthCredentialsDbService } from '@database/auth-credentials/auth-credentials.db-service';

describe('Auth register rollback (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authCredentialsDb: AuthCredentialsDbService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    authCredentialsDb = app.get(AuthCredentialsDbService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('rolls back the user row when refresh-token issuance fails', async () => {
    const email = `rollback-${Date.now()}@test.com`;

    const spy = jest
      .spyOn(authCredentialsDb, 'issueRefreshToken')
      .mockRejectedValueOnce(new Error('simulated token issue failure'));

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'Passw0rd!', firstName: 'X' })
      .expect(res => {
        expect(res.status).toBeGreaterThanOrEqual(500);
      });

    const user = await prisma.user.findFirst({ where: { email } });
    expect(user).toBeNull();

    spy.mockRestore();
  });
});
```

- [ ] **Step 5: Run unit + e2e tests**

```bash
npm run type:check
npm test
npm run test:e2e
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(auth): register now runs inside DatabaseService.runInTransaction"
```

---

## Task 10: Cleanup + doc sync

**Files:**

- Delete: the already-committed removals are done; confirm no residue
- Modify: `CLAUDE.md` — folder map + routing table + coding conventions
- Modify: `docs/coding-guidelines/06-database-patterns.md`
- Modify: `docs/architecture/database-design.md`
- Modify: `docs/guides/FOR-Todo-Module.md`
- Modify: `docs/guides/FOR-Authentication.md`
- Modify: `.claude/skills/add-module.md` (if it documents the repository pattern)

- [ ] **Step 1: Confirm no stray files**

```bash
ls src/database/repositories 2>/dev/null
ls prisma 2>/dev/null
find src/modules -name '*.repository.ts'
grep -rn "@database/repositories/base.repository" src/ test/
```

Expected: first three commands print nothing; last one reports zero matches.

- [ ] **Step 2: Update `CLAUDE.md`**

In the "Folder Map" section, replace the `database/` sub-tree with:

```
├── database/              # All persistence. Only src/database/** may import from @prisma/client.
│   ├── prisma/            # schema.prisma, migrations/, seed.ts
│   ├── base.repository.ts
│   ├── prisma.service.ts, prisma.module.ts
│   ├── database.service.ts, database.module.ts, types.ts
│   ├── users/             # UsersDbService + UsersDbRepository
│   ├── auth-credentials/  # RefreshToken + ApiKey
│   ├── todo-lists/
│   ├── todo-items/        # TodoItem + TodoItemTag
│   └── tags/
```

In the Routing Table, update the "Change database schema" row to reference `src/database/prisma/schema.prisma` and add a new row:

| Add queries to a model | `docs/coding-guidelines/06-database-patterns.md`, relevant `src/database/<aggregate>/*.db-service.ts` |

In "Coding Conventions", add:

> **DB-layer contract:** Feature services and controllers never import from `@prisma/client` query types (`Prisma.*Input`). They inject `*DbService` classes from `@database/<aggregate>/`. Use `DatabaseService.runInTransaction(fn)` to compose multi-aggregate writes atomically.

- [ ] **Step 3: Update `docs/coding-guidelines/06-database-patterns.md`**

Replace any section that describes the "feature-module repository" pattern with the `DbService + DbRepository` aggregate pattern. Add an example of the `runInTransaction` usage from `AuthService.register`.

- [ ] **Step 4: Update `docs/architecture/database-design.md`**

Update the physical layout and add an aggregate-boundary diagram/paragraph describing the 5 aggregates.

- [ ] **Step 5: Update the FOR-\* guides**

In `docs/guides/FOR-Todo-Module.md` and `docs/guides/FOR-Authentication.md`, update any code examples that inject `*Repository` to inject `*DbService` instead.

- [ ] **Step 6: Update the `add-module` skill**

If `.claude/skills/add-module.md` references creating a `*.repository.ts` in the feature folder, update it to direct contributors to add a new aggregate under `src/database/<aggregate>/` (or a method on an existing aggregate's `*DbService`), then consume the DbService from the feature service.

- [ ] **Step 7: Final verification — the invariant greps**

```bash
npm run type:check
npm test
npm run test:e2e

# Invariant 1: no query types in feature code
grep -rn "Prisma\." src/modules/ src/common/ src/bootstrap/
# Invariant 2: no direct prisma calls outside src/database/
grep -rn "this.prisma\." src/modules/
# Invariant 3: only model-type imports from @prisma/client in feature code
grep -rn "from '@prisma/client'" src/modules/ src/common/ src/bootstrap/
```

Expected:

- Invariant 1 → zero matches (or only occurrences inside `src/database/**`, which this grep excludes).
- Invariant 2 → zero matches.
- Invariant 3 → matches only reference model types (e.g., `User`, `TodoList`, `ApiKey`), never `Prisma.*` namespaces.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "docs: sync guides and CLAUDE.md with database-layer refactor"
```

---

## Done

At this point:

- All 5 aggregates live under `src/database/<aggregate>/`.
- Every feature module uses `*DbService` instead of a repository.
- `@prisma/client` query types (`Prisma.*`) never appear outside `src/database/`.
- `AuthService.register` is transactional, verified by an e2e rollback test.
- Docs and `CLAUDE.md` reflect the new architecture.

If any of the invariant greps in Task 10 Step 7 report a match outside `src/database/**`, fix it before declaring done.
