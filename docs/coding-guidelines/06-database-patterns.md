# 06 — Database Patterns

## Database Layer Architecture

The codebase uses a **multi-tier raw-`pg` pool architecture**. Prisma is used
only for schema migrations. Feature services access pools directly via
`MultiDbService` and `ArchiveRegistryService`.

```
Feature Service (e.g. OrdersService)
    ↓ injects
MultiDbService           ← pool manager (primary, replicas, metadata, archive)
    ↓ returns
pg.Pool instance         ← caller runs raw SQL queries directly

Feature Service
    ↓ injects (optionally)
ArchiveRegistryService   ← year+tier → pg.Pool resolver (loaded from archive_databases table)
```

- **`DatabaseModule`** (`@Global()`) — registers `MultiDbService` and
  `ArchiveRegistryService`; exports both. Feature modules inject them without
  adding `DatabaseModule` to their imports.
- **`MultiDbService`** — manages `pg.Pool` instances: primary (writes, max 20),
  replica-1 and replica-2 (round-robin reads, max 15 each), metadata/warm
  (max 10), cold-archive pools (lazily created per DB, max 5 each).
- **`ArchiveRegistryService`** — loads the `archive_databases` table from the
  primary on `onModuleInit`; exposes `getPoolForYear(year, tier)` so feature
  services can route archival reads without hard-coding host/port/db.

> Note: `BaseRepository`, `DatabaseService`, per-entity `*DbRepository` /
> `*DbService` classes, `DbTransactionClient`, and the `tenant-scope.extension`
> were removed in the feat/observability pivot. Prisma `$extends` is no longer
> used at runtime.

### Pool Routing Summary

| Use case                         | Pool method                                   | Notes                             |
| -------------------------------- | --------------------------------------------- | --------------------------------- |
| Write (INSERT / UPDATE / DELETE) | `getPrimaryPool()`                            | Always primary                    |
| Read (SELECT — recent data)      | `getReadPool()`                               | Round-robin replica-1 / replica-2 |
| Read — warm archive (tier 3)     | `getMetadataPool()`                           | `metadata_archive_db`             |
| Read — cold archive (tier 4)     | `getPoolForYear(year, 4)` via ArchiveRegistry | Lazily created per DB             |

### Adding a new feature that needs DB access

1. Inject `MultiDbService` (and optionally `ArchiveRegistryService`) into the
   feature service.
2. Call `getPrimaryPool()` / `getReadPool()` / `getMetadataPool()` /
   `getPoolForYear(year, tier)` to obtain a `pg.Pool`.
3. Run raw SQL via `pool.query(...)` or `pool.connect()` for transactions.
4. Type the result rows using interfaces from `src/database/interfaces/index.ts`
   (`OrderRow`, `OrderItemRow`, `OrderWithItems`, `UserOrderIndexEntry`, etc.)
   or define new interfaces there.
5. No registration in `DatabaseModule` is needed — `MultiDbService` and
   `ArchiveRegistryService` are already globally exported.

## Prisma Usage Rules

- **Prisma is for migrations only** — do NOT inject `PrismaService` in feature
  services for runtime queries. Use `MultiDbService` pools instead.
- The Prisma schema lives at `src/database/prisma/schema.prisma`.
- After changing the schema, regenerate Prisma Client and create a migration
  (see Migration Workflow below).

## Raw SQL Conventions

- Always parameterise queries — never interpolate user-supplied values into
  SQL strings. Use `pool.query('SELECT … WHERE id = $1', [id])`.
- Type result rows explicitly using interfaces from `src/database/interfaces/`.
- For multi-statement transactions, use `pool.connect()` → `BEGIN` → `COMMIT`
  / `ROLLBACK` pattern; release the client in a `finally` block.

```typescript
// Example — parameterised read from replica
const pool = this.multiDb.getReadPool();
const { rows } = await pool.query<OrderRow>(
  'SELECT * FROM orders_recent WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
  [userId, limit],
);

// Example — archive read via registry
const archivePool = this.archiveRegistry.getPoolForYear(2023, 4);
if (!archivePool) throw ErrorException.notFound('Archive', '2023');
const { rows } = await archivePool.query<OrderRow>('SELECT * FROM orders WHERE order_id = $1', [
  id,
]);
```

## Pagination

Use the `PaginationParams` interface from `@common/interfaces` and return
`PaginatedResult<T>`. Implement `skip` / `limit` with `OFFSET` / `LIMIT` in
raw SQL (no ORM pagination helper is available). For high-volume archival reads,
prefer cursor-based pagination over offset pagination.

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
