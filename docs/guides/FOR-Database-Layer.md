# FOR-Database-Layer.md — Database Layer Feature Guide

> Related: `docs/coding-guidelines/06-database-patterns.md`,
> `docs/architecture/service-architecture.md`, `docs/architecture/database-design.md`,
> `docs/guides/FOR-Multi-Tenancy.md`

---

## 1. Business Use Case

The database layer manages a **multi-tier storage topology** for large-scale
order management. Prisma is used only for schema migrations; all runtime
queries use raw `pg.Pool` instances managed by `MultiDbService`. Goals:

- **Tier routing** — write all orders to the primary pool; distribute reads
  round-robin across replicas; route archival lookups to the metadata pool
  (tier 3) or per-year cold-archive pools (tier 4) via `ArchiveRegistryService`.
- **Single responsibility** — feature services contain business logic; they
  call `MultiDbService.getPrimaryPool()` / `getReadPool()` / `getMetadataPool()`
  / `getArchivePool()` and run raw SQL directly (no ORM delegate abstraction
  for runtime queries).
- **Lazy archive pool init** — cold-archive `pg.Pool` instances are created
  on first access, keyed by `"host:port:database"`.
- **Registry-driven routing** — `ArchiveRegistryService` loads the
  `archive_databases` table on startup and provides `getPoolForYear(year, tier)`.
- **Testability** — `MultiDbService` and `ArchiveRegistryService` can be mocked
  independently.

---

## 2. Flow Diagram

```
Feature Service (OrdersService, ArchivalService, …)
    │
    ├─ inject MultiDbService
    │       │
    │       ├─ getPrimaryPool()   → primary pg.Pool  (writes)
    │       ├─ getReadPool()      → replica-1 or replica-2 (round-robin reads)
    │       ├─ getMetadataPool()  → metadata pg.Pool (warm tier 3 reads)
    │       └─ getArchivePool(host, port, db) → lazily-created cold pg.Pool (tier 4)
    │
    └─ inject ArchiveRegistryService
            │
            ├─ loads archive_databases table from primary on startup
            ├─ getArchiveForYear(year, tier) → ArchiveDbConfig | undefined
            ├─ getPoolForYear(year, tier)    → pg.Pool | undefined  (convenience combo)
            └─ getPoolForArchive(cfg)        → pg.Pool
```

---

## 3. Code Structure

```
src/database/
├── prisma/
│   ├── schema.prisma                 # Prisma schema (migrations only — Product/OrderRecent/OrderItemRecent/UserOrderIndex/ArchiveDatabase/PartitionSimulation)
│   └── migrations/                   # Prisma migration history
├── database.module.ts                # @Global(); registers MultiDbService + ArchiveRegistryService
├── prisma.service.ts                 # PrismaService (used for migrations; NOT used for runtime queries)
├── interfaces/index.ts               # PoolConfig, ArchiveDbConfig, DbTier, OrderRow, OrderItemRow, OrderWithItems, UserOrderIndexEntry
├── multi-db.service.ts               # Manages primary, replica, metadata, and archive pg.Pool instances
└── archive-registry.service.ts       # Loads archive_databases on startup; year+tier → pg.Pool routing
```

> Note: `base.repository.ts`, `database.service.ts`, `types.ts`,
> `extensions/tenant-scope.extension.ts`, and the per-entity
> `users/`, `companies/`, `departments/`, `tweets/` subdirectories were
> removed as part of the pivot to raw-`pg` multi-tier architecture.

---

## 4. Key Methods

### MultiDbService

| Method                                 | Description                                                                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `getPrimaryPool()`                     | Returns the primary `pg.Pool` (max 20 connections) — use for all writes                                                                   |
| `getReadPool()`                        | Returns next replica `pg.Pool` via round-robin (replica-1 or replica-2, max 15 each); falls back to primary if no replicas are configured |
| `getMetadataPool()`                    | Returns the metadata (warm tier 3) `pg.Pool` (max 10)                                                                                     |
| `getArchivePool(host, port, database)` | Returns a lazily-created cold-archive `pg.Pool` (max 5) keyed by `"host:port:database"`                                                   |
| `onModuleInit()`                       | Connects all fixed pools and verifies primary with `SELECT 1`                                                                             |
| `onModuleDestroy()`                    | Ends all pools gracefully on shutdown                                                                                                     |

### ArchiveRegistryService

| Method                          | Description                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `loadRegistry()`                | Queries `archive_databases WHERE is_active = true` from primary; rebuilds in-memory `Map<year, ArchiveDbConfig[]>` |
| `getArchiveForYear(year, tier)` | Returns the matching `ArchiveDbConfig` or `undefined`                                                              |
| `getPoolForArchive(cfg)`        | Returns the `pg.Pool` for a given `ArchiveDbConfig`                                                                |
| `getPoolForYear(year, tier)`    | Convenience combo — resolves year+tier to a pool in one call                                                       |
| `getAllArchives()`              | Returns the full in-memory `Map<number, ArchiveDbConfig[]>`                                                        |

### Key Interfaces (`src/database/interfaces/index.ts`)

| Interface             | Purpose                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------- | --- | -------------------------- |
| `PoolConfig`          | Config shape for creating a `pg.Pool`                                                    |
| `ArchiveDbConfig`     | Row from `archive_databases` (id, archiveYear, databaseName, host, port, tier, isActive) |
| `DbTier`              | Union `2                                                                                 | 3   | 4` (hot=2, warm=3, cold=4) |
| `UserOrderIndexEntry` | Row from `user_order_index` table                                                        |
| `OrderRow`            | Raw order row from any tier                                                              |
| `OrderItemRow`        | Raw order-item row from any tier                                                         |
| `OrderWithItems`      | `OrderRow` extended with `items`, `tier`, `tierName`, `archive_location`                 |

---

## 5. Error Cases

The database layer does not throw domain `ErrorException`s of its own.
Feature services are responsible for translating pool/query errors via
`ErrorException.wrap(err)` or `ErrorException.internal(cause)`.

`ArchiveRegistryService.onModuleInit()` propagates any pool or query
errors from `loadRegistry()` — a startup failure here will prevent the
app from booting (fail-fast for misconfigured DB topology).

---

## 6. Configuration

`MultiDbService` reads all pool settings via `AppConfigService.get` (typed
key accessor). Required env vars for the database layer:

| Variable               | Default               | Purpose                                          |
| ---------------------- | --------------------- | ------------------------------------------------ |
| `DATABASE_URL`         | (required)            | Prisma migrations (primary DB connection string) |
| `DB_PRIMARY_HOST`      | `localhost`           | Primary DB host                                  |
| `DB_PRIMARY_PORT`      | `5432`                | Primary DB port                                  |
| `DB_PRIMARY_NAME`      | `primary_db`          | Primary DB name                                  |
| `DB_PRIMARY_USER`      | `ecom_user`           | Primary DB user                                  |
| `DB_PRIMARY_PASSWORD`  | `ecom_pass`           | Primary DB password                              |
| `DB_REPLICA_1_HOST`    | `localhost`           | Replica 1 host                                   |
| `DB_REPLICA_1_PORT`    | `5433`                | Replica 1 port                                   |
| `DB_REPLICA_2_HOST`    | `localhost`           | Replica 2 host                                   |
| `DB_REPLICA_2_PORT`    | `5434`                | Replica 2 port                                   |
| `DB_METADATA_HOST`     | `localhost`           | Metadata (warm) DB host                          |
| `DB_METADATA_PORT`     | `5435`                | Metadata DB port                                 |
| `DB_METADATA_NAME`     | `metadata_archive_db` | Metadata DB name                                 |
| `DB_METADATA_USER`     | `ecom_user`           | Metadata DB user                                 |
| `DB_METADATA_PASSWORD` | `ecom_pass`           | Metadata DB password                             |
| `REDIS_HOST`           | `localhost`           | Redis host (planned — not yet consumed)          |
| `REDIS_PORT`           | `6379`                | Redis port (planned — not yet consumed)          |

Cold-archive pool credentials reuse `DB_PRIMARY_USER` / `DB_PRIMARY_PASSWORD`;
connection details (host, port, database name) come from the `archive_databases`
table loaded by `ArchiveRegistryService` at startup.
