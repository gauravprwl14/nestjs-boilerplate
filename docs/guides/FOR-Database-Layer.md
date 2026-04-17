# FOR-Database-Layer.md — Database Layer Feature Guide

> Related: `docs/coding-guidelines/06-database-patterns.md`, `docs/architecture/service-architecture.md`, `docs/architecture/database-design.md`

---

## 1. Business Use Case

The database layer provides a clean, testable abstraction between feature services and Prisma. Goals:

- **Single responsibility:** Feature services contain only business logic; they never write SQL.
- **Transaction safety:** `DatabaseService.runInTransaction()` lets feature services compose multiple `*DbService` calls atomically without coupling to Prisma internals.
- **Testability:** Each `*DbService` and `*DbRepository` can be mocked independently in unit tests.
- **Encapsulation:** Feature code never imports from `@prisma/client` for query types — `DbTransactionClient` is the only Prisma type that crosses the boundary.

---

## 2. Flow Diagram

```
Feature Service
    │
    ├─ inject *DbService (e.g. UsersDbService)
    │       │
    │       └─ delegates to *DbRepository (e.g. UsersDbRepository)
    │               │
    │               └─ calls PrismaService delegate (e.g. prisma.user)
    │
    └─ inject DatabaseService (for cross-aggregate transactions)
            │
            └─ calls prisma.$transaction(fn)
```

---

## 3. Code Structure

```
src/database/
├── prisma/
│   └── schema.prisma                    # Prisma schema (source of truth)
├── base.repository.ts                   # Abstract base class for all repositories
├── database.module.ts                   # @Global() module; registers all DbRepository/DbService
├── database.service.ts                  # Exposes runInTransaction(); nothing else
├── types.ts                             # DbTransactionClient type alias
├── users/
│   ├── users.db-repository.ts           # User-specific Prisma calls
│   └── users.db-service.ts              # Public DB API for User aggregate
├── auth-credentials/
│   ├── auth-credentials.db-repository.ts  # RefreshToken + ApiKey Prisma calls
│   └── auth-credentials.db-service.ts     # Public DB API for auth credentials
└── todo-lists/
    ├── todo-lists.db-repository.ts      # TodoList-specific Prisma calls
    └── todo-lists.db-service.ts         # Public DB API for TodoList aggregate
```

---

## 4. Key Methods

### BaseRepository

| Method                                             | Description                          |
| -------------------------------------------------- | ------------------------------------ |
| `create(data, tx?)`                                | Insert a new record                  |
| `findUnique(where, include?, tx?)`                 | Find by unique key                   |
| `findFirst(where?, include?, tx?)`                 | Find first matching record           |
| `findMany(where?, orderBy?, include?, tx?)`        | Find all matching records            |
| `findManyPaginated(params, where?, include?, tx?)` | Find with pagination metadata        |
| `update(where, data, tx?)`                         | Update by unique key                 |
| `delete(where, tx?)`                               | Hard delete                          |
| `softDelete(where, tx?)`                           | Set `deletedAt = now()`              |
| `restore(where, tx?)`                              | Clear `deletedAt`                    |
| `count(where?, tx?)`                               | Count matching records               |
| `exists(where?, tx?)`                              | Returns `true` if any record matches |
| `withTransaction(fn, options?)`                    | Run callback in a transaction        |

### DatabaseService

| Method                           | Description                                                               |
| -------------------------------- | ------------------------------------------------------------------------- |
| `runInTransaction(fn, options?)` | Execute a callback atomically; pass `tx` to all `*DbService` calls inside |

### UsersDbService

| Method                                  | Description                            |
| --------------------------------------- | -------------------------------------- |
| `findById(id, tx?)`                     | Find user by id regardless of status   |
| `findActiveByEmail(email, tx?)`         | Find non-deleted user by email         |
| `findActiveById(id, tx?)`               | Find non-deleted ACTIVE user by id     |
| `create(input, tx?)`                    | Create a new user                      |
| `updateProfile(id, patch, tx?)`         | Update firstName/lastName              |
| `updatePassword(id, passwordHash, tx?)` | Update password hash                   |
| `recordFailedLogin(id, patch, tx?)`     | Increment failed count + optional lock |
| `resetFailedLogin(id, tx?)`             | Zero the failed count and clear lock   |

### AuthCredentialsDbService

| Method                                             | Description                              |
| -------------------------------------------------- | ---------------------------------------- |
| `issueRefreshToken(input, tx?)`                    | Create a new refresh token               |
| `findRefreshTokenByValueWithUser(token, tx?)`      | Find token + eager-load owning user      |
| `revokeRefreshToken(id, tx?)`                      | Set `revokedAt = now()` on one token     |
| `revokeAllActiveRefreshTokensForUser(userId, tx?)` | Revoke all non-revoked tokens for a user |
| `createApiKey(userId, input, tx?)`                 | Create ACTIVE API key                    |
| `findApiKeysByUserId(userId, tx?)`                 | List API keys (no hash)                  |
| `findApiKeyByIdForUser(userId, keyId, tx?)`        | Find API key scoped to user              |
| `revokeApiKey(keyId, tx?)`                         | Set status to REVOKED                    |
| `findApiKeyByHashWithUser(keyHash, tx?)`           | Find API key by SHA-256 hash + user      |
| `touchApiKeyLastUsed(keyId, tx?)`                  | Stamp `lastUsedAt = now()`               |

### TodoListsDbService

| Method                                        | Description                            |
| --------------------------------------------- | -------------------------------------- |
| `createForUser(userId, input, tx?)`           | Create list owned by user              |
| `findActiveByUserId(userId, pagination, tx?)` | Paginated non-deleted lists for user   |
| `findByIdForUser(userId, id, tx?)`            | Find list; null if not owned / deleted |
| `updateById(id, patch, tx?)`                  | Patch title/description                |
| `softDeleteById(id, tx?)`                     | Set `deletedAt = now()`                |

---

## 5. Error Cases

The database layer does not throw domain `ErrorException`s — it returns `null` or propagates Prisma errors. Feature services are responsible for converting `null` returns to `ErrorException.notFound(...)` and Prisma errors are handled by `AllExceptionsFilter` via `handlePrismaError()`.

---

## 6. Configuration

No additional configuration is required — the database layer is wired through `DatabaseModule` which imports `PrismaModule`. `DatabaseModule` is `@Global()` so all `*DbService` exports are available to every feature module without adding imports.
