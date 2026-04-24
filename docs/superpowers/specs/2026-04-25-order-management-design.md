# Order Management System — Design Spec

**Date:** 2026-04-25
**Branch:** feat/order-management
**Approach:** Repurpose existing Enterprise Twitter NestJS boilerplate (Approach A)
**Container runtime:** Podman / Podman Compose

---

## 1. Goals

Build a production-grade e-commerce order archival system demonstrating:

- Multi-tier data architecture (Hot / Warm / Cold storage across 7 Postgres instances)
- Primary + 2 read replicas with round-robin load balancing for the hot tier
- Dynamic multi-archive database routing via an in-memory registry
- Auto-rotating partition simulation (move orders from hot → warm → cold)
- 3.2M realistic orders with proper product FKs, shipping address JSON, payment details
- Seed via Postgres `generate_series` SQL (no app-loop, seeds in ~5 min)
- k6 multi-scenario load tests (read-heavy, write, archival stats)
- Docker/Podman Compose single `podman-compose up` startup

**Hard constraints:**

- Total DB data under 1 GB across all 7 instances
- All images + data under 500 MB for application containers (observability stack excluded)
- No code pushed to `main` or `dev` branches
- No branches deleted

---

## 2. What We Keep from the Existing Codebase

| Path                          | Action                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/common/`                 | Keep entirely — middleware, guards, decorators, interceptors, pipes, filters all reuse unchanged |
| `src/logger/`                 | Keep — AppLogger (Pino) used in new services                                                     |
| `src/telemetry/`              | Keep — OTel SDK, `@Trace`, `@InstrumentClass` decorators                                         |
| `src/errors/`                 | Keep — ErrorException + domain error codes (add order-specific codes)                            |
| `src/bootstrap/`              | Keep — graceful shutdown, process signal handlers                                                |
| `src/config/config.module.ts` | Keep, extend `env.schema.ts` with multi-DB env vars                                              |
| `docker/Dockerfile`           | Keep — 5-stage build (base/deps/dev/builder/prod)                                                |
| `docker/grafana/`             | Keep — full observability stack (OTel, Tempo, Loki, Prometheus, Grafana)                         |

## 3. What We Replace

| Path                                                           | Action                                                                        |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/database/prisma/schema.prisma`                            | Replace with order domain schema (primary DB only)                            |
| `src/database/prisma.service.ts`                               | Simplify — remove tenant-scope extension, keep basic PrismaClient for primary |
| `src/database/database.service.ts`                             | Replace with `MultiDbService` (raw `pg.Pool` for all 7 DBs)                   |
| `src/database/base.repository.ts`                              | Keep pattern, repurpose for orders                                            |
| `src/database/companies/`, `departments/`, `tweets/`, `users/` | Delete — replaced by `orders/`, `products/`, `archives/`                      |
| `src/database/extensions/tenant-scope.extension.ts`            | Delete — no multi-tenancy in order domain                                     |
| `src/modules/departments/`, `tweets/`                          | Delete — replaced by `orders/`, `archival/`, `mock-data/`                     |
| `src/app.module.ts`                                            | Rewrite module wiring for order domain                                        |
| `docker-compose.yml`                                           | Extend with 7 Postgres instances + Redis + replication setup                  |
| `prisma/seed.ts`                                               | Delete — replaced by SQL `generate_series` init scripts                       |
| `README.md`, `CLAUDE.md`                                       | Update for order management domain + Podman                                   |

---

## 4. Docker / Podman Architecture

**Runtime:** Podman + Podman Compose (drop-in replacement for Docker Compose syntax)

### Containers

```
primary-db           postgres:16  port 5432 → host 5432   Hot tier, primary (writes + strong reads)
primary-replica-1    postgres:16  port 5432 → host 5433   Read replica 1 (round-robin reads)
primary-replica-2    postgres:16  port 5432 → host 5434   Read replica 2 (round-robin reads)
metadata-archive-db  postgres:16  port 5432 → host 5435   Warm tier (lightweight order metadata)
archive-2023         postgres:16  port 5432 → host 5436   Cold tier 2023
archive-2024         postgres:16  port 5432 → host 5437   Cold tier 2024
archive-2025         postgres:16  port 5432 → host 5438   Cold tier 2025
redis                redis:7      port 6379 → host 6379    user_order_index cache
app                  NestJS       port 3000 → host 3000
otel-collector       (existing)
tempo                (existing)
loki                 (existing)
prometheus           (existing)
grafana              (existing)
```

### Streaming Replication Setup

Primary `postgresql.conf` overrides (via mounted config):

```
wal_level = replica
max_wal_senders = 3
wal_keep_size = 256MB
hot_standby = on
```

Each replica entrypoint script:

1. Waits for primary to be healthy (`pg_isready`)
2. Runs `pg_basebackup -h primary-db -U replicator -D $PGDATA -P -R`
3. Starts Postgres in standby mode (`standby.signal` written by `-R` flag)

Replication user created in `primary-init.sql`:

```sql
CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'replicator_pass';
```

`pg_hba.conf` on primary allows `replicator` from the Docker/Podman network.

---

## 5. Database Schema

### PRIMARY DB — Hot Tier (last 90 days)

```sql
-- 30 products with realistic data
CREATE TABLE products (
    product_id   BIGSERIAL PRIMARY KEY,
    name         VARCHAR(255) NOT NULL,
    sku          VARCHAR(50)  UNIQUE NOT NULL,
    category     VARCHAR(100) NOT NULL,
    price        DECIMAL(10,2) NOT NULL,
    brand        VARCHAR(100),
    total_orders_count  INT DEFAULT 0,
    recent_orders_count INT DEFAULT 0
);

-- Hot orders (last 90 days) — auto-rotated
CREATE TABLE orders_recent (
    order_id       BIGSERIAL PRIMARY KEY,
    user_id        BIGINT NOT NULL,
    order_number   VARCHAR(50) UNIQUE NOT NULL,
    total_amount   DECIMAL(10,2) NOT NULL,
    status         VARCHAR(20) NOT NULL,     -- pending/confirmed/shipped/delivered/cancelled
    shipping_address JSONB NOT NULL,          -- {name, line1, city, state, pincode, country}
    payment_method VARCHAR(20) NOT NULL,     -- credit_card/upi/cod/wallet
    payment_last4  VARCHAR(4),               -- last 4 digits if card
    coupon_code    VARCHAR(50),
    created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_orders_user_created ON orders_recent(user_id, created_at DESC);
CREATE INDEX idx_orders_created      ON orders_recent(created_at DESC);
CREATE INDEX idx_orders_status       ON orders_recent(status);

-- Hot order items (FK to products)
CREATE TABLE order_items_recent (
    item_id         BIGSERIAL PRIMARY KEY,
    order_id        BIGINT NOT NULL REFERENCES orders_recent(order_id) ON DELETE CASCADE,
    product_id      BIGINT NOT NULL REFERENCES products(product_id),
    quantity        INT NOT NULL,
    unit_price      DECIMAL(10,2) NOT NULL,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    tax_amount      DECIMAL(10,2) DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_items_order   ON order_items_recent(order_id);
CREATE INDEX idx_items_product ON order_items_recent(product_id);

-- Universal lookup index (spans all tiers)
CREATE TABLE user_order_index (
    user_id          BIGINT    NOT NULL,
    order_id         BIGINT    NOT NULL,
    created_at       TIMESTAMP NOT NULL,
    tier             SMALLINT  NOT NULL,  -- 2=hot, 3=warm, 4=cold
    archive_location VARCHAR(100),        -- NULL for hot, DB name for warm/cold
    PRIMARY KEY (user_id, created_at DESC, order_id)
);
CREATE INDEX idx_uoi_order_id ON user_order_index(order_id);
CREATE INDEX idx_uoi_tier     ON user_order_index(tier);

-- Archive DB registry (maps year → DB connection info)
CREATE TABLE archive_databases (
    id             SERIAL PRIMARY KEY,
    archive_year   INT NOT NULL,
    database_name  VARCHAR(100) NOT NULL,
    host           VARCHAR(255) NOT NULL,
    port           INT NOT NULL DEFAULT 5432,
    tier           SMALLINT NOT NULL,  -- 3=metadata, 4=cold
    is_active      BOOLEAN DEFAULT TRUE,
    created_at     TIMESTAMP DEFAULT NOW()
);

-- Partition simulation control
CREATE TABLE partition_simulation (
    id             SERIAL PRIMARY KEY,
    partition_date DATE NOT NULL,
    is_rotated     BOOLEAN DEFAULT FALSE,
    rotated_at     TIMESTAMP,
    records_moved  INT DEFAULT 0
);
```

### METADATA ARCHIVE DB — Warm Tier (2024)

```sql
CREATE TABLE order_metadata_archive (
    order_id         BIGINT PRIMARY KEY,
    user_id          BIGINT NOT NULL,
    order_number     VARCHAR(50) NOT NULL,
    total_amount     DECIMAL(10,2) NOT NULL,
    status           VARCHAR(20) NOT NULL,
    payment_method   VARCHAR(20) NOT NULL,
    created_at       TIMESTAMP NOT NULL,
    archive_location VARCHAR(100) NOT NULL,
    archived_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_meta_user_created ON order_metadata_archive(user_id, created_at DESC);
CREATE INDEX idx_meta_archive_loc  ON order_metadata_archive(archive_location);
```

### COLD ARCHIVE DBs — 2023, 2024, 2025 (identical schema)

```sql
CREATE TABLE archived_orders (
    order_id         BIGINT PRIMARY KEY,
    user_id          BIGINT NOT NULL,
    order_number     VARCHAR(50) NOT NULL,
    total_amount     DECIMAL(10,2) NOT NULL,
    status           VARCHAR(20) NOT NULL,
    shipping_address JSONB NOT NULL,
    payment_method   VARCHAR(20) NOT NULL,
    coupon_code      VARCHAR(50),
    created_at       TIMESTAMP NOT NULL,
    archived_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_arch_user    ON archived_orders(user_id);
CREATE INDEX idx_arch_created ON archived_orders(created_at);

CREATE TABLE archived_order_items (
    item_id         BIGINT PRIMARY KEY,
    order_id        BIGINT NOT NULL REFERENCES archived_orders(order_id),
    product_id      BIGINT NOT NULL,
    product_name    VARCHAR(255) NOT NULL,   -- denormalized (no FK across DBs)
    quantity        INT NOT NULL,
    unit_price      DECIMAL(10,2) NOT NULL,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    tax_amount      DECIMAL(10,2) DEFAULT 0,
    created_at      TIMESTAMP NOT NULL
);
CREATE INDEX idx_arch_items_order   ON archived_order_items(order_id);
CREATE INDEX idx_arch_items_product ON archived_order_items(product_id);
```

---

## 6. Data Generation Strategy

**Method:** Postgres `generate_series` in SQL init scripts — no app-level loop needed.

**Distribution (total ~3.2M records, estimated ~800 MB):**

| Tier               | DB               | Orders         | Items (avg 3)   | Index entries | Est. size   |
| ------------------ | ---------------- | -------------- | --------------- | ------------- | ----------- |
| Hot (last 90 days) | primary-db       | 200K           | 600K            | 200K          | ~180 MB     |
| Warm (2024)        | metadata-archive | 1M             | — (lightweight) | 1M            | ~150 MB     |
| Cold 2023          | archive-2023     | 700K           | 2.1M            | 700K          | ~200 MB     |
| Cold 2024          | archive-2024     | 650K           | 1.95M           | 650K          | ~185 MB     |
| Cold 2025          | archive-2025     | 450K           | 1.35M           | 450K          | ~135 MB     |
| **Total**          |                  | **~3M orders** | **~6M items**   | **~3M**       | **~850 MB** |

Sample generate_series for hot orders:

```sql
INSERT INTO orders_recent (user_id, order_number, total_amount, status, shipping_address, payment_method, payment_last4, created_at, updated_at)
SELECT
    (random() * 9999 + 1)::BIGINT,
    'ORD-' || gs,
    round((random() * 9000 + 100)::numeric, 2),
    (ARRAY['pending','confirmed','shipped','delivered','cancelled'])[floor(random()*5+1)],
    jsonb_build_object(
        'name', 'User ' || (random()*9999+1)::int,
        'line1', (floor(random()*999+1)::int)::text || ' Main St',
        'city', (ARRAY['Mumbai','Delhi','Bengaluru','Chennai','Hyderabad'])[floor(random()*5+1)],
        'state', (ARRAY['MH','DL','KA','TN','TS'])[floor(random()*5+1)],
        'pincode', lpad((floor(random()*899999+100000)::int)::text, 6, '0'),
        'country', 'IN'
    ),
    (ARRAY['credit_card','upi','cod','wallet'])[floor(random()*4+1)],
    lpad((floor(random()*9999)::int)::text, 4, '0'),
    NOW() - (random() * INTERVAL '90 days'),
    NOW()
FROM generate_series(1, 200000) gs;
```

---

## 7. Application Layer (Repurpose Strategy)

### New Database Layer (`src/database/`)

**`MultiDbService`** (replaces `database.service.ts`):

- Manages `pg.Pool` instances for all 7 databases
- `getPrimaryPool()` → write pool to primary
- `getReadPool()` → round-robin across replica-1 and replica-2 (atomic counter)
- `getMetadataPool()` → warm archive pool
- `getArchivePool(dbName)` → lazy-initialized cold archive pool

**`ArchiveRegistryService`** (new):

- On startup: queries `archive_databases` table from primary
- Caches year → `{host, port, database_name}` mapping
- `getPoolForDate(date)` → returns correct cold archive pool

**`ReadReplicaRouter`** (new, within MultiDbService):

- Atomic round-robin counter using Node.js `Atomics` or simple mod increment
- Routes `SELECT` queries to replica-1 or replica-2
- Falls back to primary if both replicas are unhealthy

### New Modules (`src/modules/`)

**`OrdersModule`**:

- `OrdersController` — CRUD + user order list + product orders
- `OrdersService` — tier-based query routing (hot → replicas, warm → metadata, cold → archive)
- `OrdersRepository` — raw SQL queries via `pg.Pool`

**`ArchivalModule`**:

- `ArchivalController` — admin endpoints (stats, DB sizes, archive for year)
- `ArchivalService` — aggregate stats across all DBs
- `PartitionRotationService` — simulate moving hot → warm → cold

**`MockDataModule`**:

- `MockDataController` — `POST /mock-data/generate` triggers SQL-level generation
- `MockDataService` — executes `generate_series` SQL scripts if tables are empty
- `DataStatusService` — counts per tier, reports distribution

### Prisma (schema migrations only)

Prisma is kept **only as a migration tool** — `prisma migrate deploy` runs against the primary DB to create the hot-tier schema on startup. All actual runtime queries (including reads on the primary DB hot tier) go through `MultiDbService` raw `pg.Pool` instances. This ensures read replicas (which Prisma cannot address natively) are used for hot-tier reads. No `PrismaService` is injected into any order domain service.

---

## 8. API Endpoints

### Orders

```
GET  /api/v1/orders/user/:userId?page=1&limit=20   — paginated orders across all tiers
GET  /api/v1/orders/:orderId                        — single order (routes to correct tier)
POST /api/v1/orders                                 — create order (primary only)
GET  /api/v1/orders/product/:productId?limit=50     — orders for a product
```

### Archival (Admin)

```
POST /api/v1/admin/archival/simulate-rotation       — move N oldest hot orders → warm
GET  /api/v1/admin/archival/stats                   — row counts per tier
GET  /api/v1/admin/archival/database-sizes          — pg_database_size() per instance
GET  /api/v1/admin/archival/archive-for-year/:year  — registry lookup
```

### Mock Data

```
POST /api/v1/mock-data/generate                     — run generate_series if empty
GET  /api/v1/mock-data/status                       — counts per tier + DB
```

---

## 9. Read Replica Routing

All `GET` order queries route through `MultiDbService.getReadPool()`:

```
Request → OrdersService.getUserOrders()
              ↓
         MultiDbService.getReadPool()   ← round-robin: replica-1 or replica-2
              ↓
         SELECT from user_order_index   ← via getReadPool() — replicas have this table via streaming replication
              ↓
         Group by tier
              ↓
    ┌─────────────────────────────────┐
    │ tier=2 → getReadPool() (hot)   │
    │ tier=3 → getMetadataPool()     │
    │ tier=4 → getArchivePool(name)  │
    └─────────────────────────────────┘
              ↓
         Merge + sort by created_at DESC
              ↓
         Cache result in Redis (TTL 60s)
```

Writes (`POST /orders`) always go to `getPrimaryPool()`.

---

## 10. k6 Load Test Scenarios

Three scripts under `test/k6/`:

**`test/k6/read-orders.js`** — Read-heavy scenario:

- 100 concurrent VUs, 3 min duration
- `GET /orders/user/:userId` with random userId (1–10000)
- Asserts p95 < 200ms, p99 < 500ms
- Shows replica routing in OTel traces

**`test/k6/create-orders.js`** — Write scenario:

- 20 concurrent VUs, 2 min duration
- `POST /orders` with realistic payload
- Asserts p95 < 300ms
- Shows primary-only write path

**`test/k6/archival-stats.js`** — Analytics scenario:

- 5 concurrent VUs, 1 min duration
- `GET /admin/archival/database-sizes` + `GET /admin/archival/stats`
- Asserts p95 < 1000ms (cross-DB aggregation is heavier)

---

## 11. Documentation Updates

| File            | Change                                                                      |
| --------------- | --------------------------------------------------------------------------- |
| `README.md`     | Full rewrite — order management quick start, API docs, architecture diagram |
| `CLAUDE.md`     | Update domain section, add Podman note, update folder map for new modules   |
| `Question-2.md` | Add replica set section, update with final design decisions                 |
| `docs/plans/`   | New implementation plan (via writing-plans skill)                           |

---

## 12. Implementation Sequence (for parallel subagents)

The implementation is decomposed into 5 independent tracks run in parallel via git worktrees:

| Track                   | Worktree branch    | Scope                                                                    |
| ----------------------- | ------------------ | ------------------------------------------------------------------------ |
| A — Infrastructure      | `feat/om-infra`    | docker-compose.yml, init-scripts/, Podman setup, replication entrypoints |
| B — Database layer      | `feat/om-database` | MultiDbService, ArchiveRegistryService, ReadReplicaRouter, env schema    |
| C — Orders module       | `feat/om-orders`   | OrdersModule (controller + service + repository)                         |
| D — Archival + MockData | `feat/om-archival` | ArchivalModule, MockDataModule, PartitionRotationService                 |
| E — Docs + k6           | `feat/om-docs`     | README, CLAUDE.md, Question-2.md, k6 scripts                             |

Each track merges back to `feat/order-management` sequentially after review.
