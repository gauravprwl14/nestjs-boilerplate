# Order Management System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repurpose the Enterprise Twitter NestJS boilerplate into a production-grade e-commerce order archival system with multi-tier storage, read replicas, and realistic 3M-order dataset.

**Architecture:** 7 Postgres instances (primary + 2 read replicas + metadata-archive + 3 cold archives), Redis cache, NestJS with raw `pg` pools for all runtime DB access (Prisma kept only as migration tool). 5 parallel implementation tracks via git worktrees, merging back to `feat/order-management`.

**Tech Stack:** NestJS 11, TypeScript, `pg` (node-postgres), Prisma 7 (migrations only), Redis (ioredis), Podman Compose, k6 load testing, Pino logger, OpenTelemetry.

**Container runtime:** Podman / podman-compose (drop-in Docker Compose YAML compatibility)

---

## Phase 0 — Shared Foundation (run on `feat/order-management` before spawning worktrees)

### Task 0.1: Update CLS keys and shared interfaces

**Files:**

- Modify: `src/common/cls/cls.constants.ts`
- Create: `src/database/interfaces/index.ts`
- Modify: `src/common/constants/app.constants.ts`

- [ ] **Step 1: Replace CLS keys for order domain**

Replace the entire content of `src/common/cls/cls.constants.ts`:

```typescript
export enum ClsKey {
  REQUEST_ID = 'requestId',
  USER_ID = 'userId',
  TRACE_ID = 'traceId',
}
```

- [ ] **Step 2: Create shared DB interfaces**

Create `src/database/interfaces/index.ts`:

```typescript
export interface PoolConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  max?: number;
}

export interface ArchiveDbConfig {
  id: number;
  archiveYear: number;
  databaseName: string;
  host: string;
  port: number;
  tier: 3 | 4;
  isActive: boolean;
}

export type DbTier = 2 | 3 | 4;

export interface UserOrderIndexEntry {
  userId: bigint;
  orderId: bigint;
  createdAt: Date;
  tier: DbTier;
  archiveLocation: string | null;
}

export interface OrderRow {
  order_id: string;
  user_id: string;
  order_number: string;
  total_amount: string;
  status: string;
  shipping_address: Record<string, unknown>;
  payment_method: string;
  payment_last4: string | null;
  coupon_code: string | null;
  created_at: Date;
  updated_at?: Date;
  archived_at?: Date;
}

export interface OrderItemRow {
  item_id: string;
  order_id: string;
  product_id: string;
  product_name?: string;
  quantity: number;
  unit_price: string;
  discount_amount: string;
  tax_amount: string;
  created_at: Date;
}

export interface OrderWithItems extends OrderRow {
  items: OrderItemRow[];
  tier: DbTier;
  tierName: 'hot' | 'warm' | 'cold';
  archive_location?: string;
}
```

- [ ] **Step 3: Update app constants — remove Twitter refs**

In `src/common/constants/app.constants.ts`, change `APP_NAME` default and `USER_ID_HEADER`:

```typescript
export const USER_ID_HEADER = 'x-user-id';
export const IS_PUBLIC_KEY = 'isPublic';
export const DEFAULT_APP_PORT = 3000;
export const DEFAULT_APP_HOST = '0.0.0.0';
export const DEFAULT_API_PREFIX = 'api';
export const DEFAULT_API_VERSION = '1';
export const DEFAULT_LOG_LEVEL = 'info';
export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10000;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
```

- [ ] **Step 4: Simplify MockAuthMiddleware — no DB lookup**

Replace `src/common/middleware/mock-auth.middleware.ts`:

```typescript
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ClsService } from 'nestjs-cls';
import { ClsKey } from '@common/cls/cls.constants';
import { USER_ID_HEADER } from '@common/constants';
import { ErrorException } from '@errors/types/error-exception';
import { AUT } from '@errors/error-codes';

@Injectable()
export class MockAuthMiddleware implements NestMiddleware {
  constructor(private readonly cls: ClsService) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    if (!req.originalUrl.startsWith('/api')) {
      return next();
    }
    const rawUserId = req.headers[USER_ID_HEADER] as string | undefined;
    if (!rawUserId) {
      throw new ErrorException(AUT.UNAUTHENTICATED, {
        message: 'Missing x-user-id header',
      });
    }
    const userId = parseInt(rawUserId, 10);
    if (isNaN(userId) || userId <= 0) {
      throw new ErrorException(AUT.UNAUTHENTICATED, {
        message: 'x-user-id must be a positive integer',
      });
    }
    this.cls.set(ClsKey.USER_ID, userId);
    next();
  }
}
```

- [ ] **Step 5: Simplify AuthContextGuard — check userId not companyId**

Replace `src/common/guards/auth-context.guard.ts`:

```typescript
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { ClsKey } from '@common/cls/cls.constants';
import { IS_PUBLIC_KEY } from '@common/constants';
import { ErrorException } from '@errors/types/error-exception';
import { AUT } from '@errors/error-codes';

@Injectable()
export class AuthContextGuard implements CanActivate {
  constructor(
    private readonly cls: ClsService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const userId = this.cls.get<number | undefined>(ClsKey.USER_ID);
    if (!userId) {
      throw new ErrorException(AUT.UNAUTHENTICATED, {
        message: 'No user context — x-user-id header missing or invalid.',
      });
    }
    return true;
  }
}
```

- [ ] **Step 6: Install pg and ioredis packages**

```bash
npm install pg ioredis
npm install --save-dev @types/pg
```

Expected: packages added to `package.json`.

- [ ] **Step 7: Commit Phase 0 foundation**

```bash
git add src/common/cls/cls.constants.ts \
        src/database/interfaces/index.ts \
        src/common/constants/app.constants.ts \
        src/common/middleware/mock-auth.middleware.ts \
        src/common/guards/auth-context.guard.ts \
        package.json package-lock.json
git commit -m "chore(foundation): simplify auth for order domain, add shared DB interfaces"
```

---

## Phase 1A — Infrastructure Track (worktree: `feat/om-infra`)

> Spawn worktree: `git worktree add ../om-infra feat/om-infra` (create branch from `feat/order-management`)

### Task 1A.1: Postgres primary configuration files

**Files:**

- Create: `docker/postgres/primary.conf`
- Create: `docker/postgres/pg_hba.conf`
- Create: `docker/postgres/replica-entrypoint.sh`

- [ ] **Step 1: Create primary postgres config**

Create `docker/postgres/primary.conf`:

```conf
# Replication settings
wal_level = replica
max_wal_senders = 5
wal_keep_size = 256MB
hot_standby = on

# Connection
max_connections = 200
shared_buffers = 256MB
work_mem = 4MB
```

- [ ] **Step 2: Create pg_hba.conf allowing replicator role**

Create `docker/postgres/pg_hba.conf`:

```conf
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             all                                     trust
host    all             all             127.0.0.1/32            md5
host    all             all             ::1/128                 md5
host    all             all             0.0.0.0/0               md5
host    replication     replicator      0.0.0.0/0               md5
```

- [ ] **Step 3: Create replica entrypoint script**

Create `docker/postgres/replica-entrypoint.sh`:

```bash
#!/bin/bash
set -e

PRIMARY_HOST="${PRIMARY_HOST:-primary-db}"
PRIMARY_PORT="${PRIMARY_PORT:-5432}"
REPLICATION_USER="${REPLICATION_USER:-replicator}"
REPLICATION_PASSWORD="${REPLICATION_PASSWORD:-replicator_pass}"

echo "Waiting for primary at $PRIMARY_HOST:$PRIMARY_PORT..."
until pg_isready -h "$PRIMARY_HOST" -p "$PRIMARY_PORT" -U "$REPLICATION_USER"; do
  sleep 2
done
echo "Primary is ready."

# Only run basebackup if data dir is empty
if [ -z "$(ls -A "$PGDATA")" ]; then
  echo "Running pg_basebackup from $PRIMARY_HOST..."
  PGPASSWORD="$REPLICATION_PASSWORD" pg_basebackup \
    -h "$PRIMARY_HOST" \
    -p "$PRIMARY_PORT" \
    -U "$REPLICATION_USER" \
    -D "$PGDATA" \
    -P \
    -R \
    --wal-method=stream
  echo "Basebackup complete. Starting standby..."
else
  echo "Data dir not empty, skipping basebackup."
fi

exec docker-entrypoint.sh postgres
```

```bash
chmod +x docker/postgres/replica-entrypoint.sh
```

- [ ] **Step 4: Commit config files**

```bash
git add docker/postgres/
git commit -m "feat(infra): add postgres replication config and replica entrypoint"
```

### Task 1A.2: SQL init scripts — primary DB schema

**Files:**

- Create: `init-scripts/primary-init.sql`

- [ ] **Step 1: Create primary init SQL**

Create `init-scripts/primary-init.sql`:

```sql
-- Replication user (must exist before replicas connect)
CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'replicator_pass';

-- Products (30 realistic items)
CREATE TABLE IF NOT EXISTS products (
    product_id          BIGSERIAL PRIMARY KEY,
    name                VARCHAR(255) NOT NULL,
    sku                 VARCHAR(50)  UNIQUE NOT NULL,
    category            VARCHAR(100) NOT NULL,
    price               DECIMAL(10,2) NOT NULL,
    brand               VARCHAR(100),
    total_orders_count  INT DEFAULT 0,
    recent_orders_count INT DEFAULT 0
);

INSERT INTO products (name, sku, category, price, brand) VALUES
('iPhone 15 Pro 256GB', 'APPL-IP15P-256', 'Electronics', 134900.00, 'Apple'),
('Samsung Galaxy S24 Ultra', 'SAMS-GS24U-001', 'Electronics', 129999.00, 'Samsung'),
('Sony WH-1000XM5', 'SONY-WH1000-XM5', 'Electronics', 29990.00, 'Sony'),
('MacBook Air M3', 'APPL-MBA-M3-256', 'Computers', 114900.00, 'Apple'),
('Dell XPS 15', 'DELL-XPS15-001', 'Computers', 159990.00, 'Dell'),
('Nike Air Max 270', 'NIKE-AM270-BLK', 'Footwear', 12995.00, 'Nike'),
('Adidas Ultraboost 23', 'ADID-UB23-WHT', 'Footwear', 17999.00, 'Adidas'),
('Levi''s 511 Slim Jeans', 'LEVI-511-32W', 'Apparel', 4999.00, 'Levi''s'),
('Uniqlo Merino Sweater', 'UNIQ-MER-BLU-M', 'Apparel', 3990.00, 'Uniqlo'),
('Instant Pot Duo 7-in-1', 'INST-DUO-7QT', 'Kitchen', 8999.00, 'Instant Pot'),
('Dyson V15 Detect', 'DYSO-V15-DET', 'Appliances', 65900.00, 'Dyson'),
('Kindle Paperwhite', 'AMZN-KPW-16GB', 'Electronics', 14999.00, 'Amazon'),
('JBL Flip 6', 'JBL-FLIP6-BLK', 'Electronics', 11999.00, 'JBL'),
('IKEA MALM Bed Frame', 'IKEA-MALM-QN', 'Furniture', 21999.00, 'IKEA'),
('Philips Air Fryer XXL', 'PHIL-AF-XXL', 'Kitchen', 12995.00, 'Philips'),
('Casio G-Shock GA-2100', 'CASI-GA2100-BLK', 'Watches', 7995.00, 'Casio'),
('HP LaserJet Pro M404n', 'HP-LJ-M404N', 'Computers', 22490.00, 'HP'),
('Bose QuietComfort 45', 'BOSE-QC45-BLK', 'Electronics', 24900.00, 'Bose'),
('Nestle Munch Pack', 'NEST-MNCH-PK12', 'Grocery', 240.00, 'Nestle'),
('Amul Butter 500g', 'AMUL-BUT-500G', 'Grocery', 285.00, 'Amul'),
('Tata Sampann Dal 1kg', 'TATA-DALP-1KG', 'Grocery', 145.00, 'Tata'),
('Woodland Waterproof Boots', 'WOOD-WTRPF-9', 'Footwear', 5999.00, 'Woodland'),
('Arrow Formal Shirt XL', 'ARRW-FRM-XL-BL', 'Apparel', 1799.00, 'Arrow'),
('Milton Thermosteel Flask', 'MILT-THER-1L', 'Kitchen', 799.00, 'Milton'),
('Prestige Pressure Cooker', 'PRES-PC-5L', 'Kitchen', 1499.00, 'Prestige'),
('Boat Rockerz 550', 'BOAT-RK550-BLU', 'Electronics', 2999.00, 'Boat'),
('Realme Narzo 60 Pro', 'RLME-N60P-8GB', 'Electronics', 23999.00, 'Realme'),
('Asian Paints Royale 4L', 'ASIAN-ROY-4L-W', 'Home', 2650.00, 'Asian Paints'),
('Usha Table Fan 400mm', 'USHA-TF400-WHT', 'Appliances', 2199.00, 'Usha'),
('Himalaya Neem Face Wash', 'HIMA-NFW-150ML', 'Personal Care', 175.00, 'Himalaya');

-- Hot orders table
CREATE TABLE IF NOT EXISTS orders_recent (
    order_id         BIGSERIAL PRIMARY KEY,
    user_id          BIGINT NOT NULL,
    order_number     VARCHAR(50) UNIQUE NOT NULL,
    total_amount     DECIMAL(10,2) NOT NULL,
    status           VARCHAR(20) NOT NULL,
    shipping_address JSONB NOT NULL,
    payment_method   VARCHAR(20) NOT NULL,
    payment_last4    VARCHAR(4),
    coupon_code      VARCHAR(50),
    created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders_recent(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_created      ON orders_recent(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status       ON orders_recent(status);

-- Hot order items
CREATE TABLE IF NOT EXISTS order_items_recent (
    item_id         BIGSERIAL PRIMARY KEY,
    order_id        BIGINT NOT NULL REFERENCES orders_recent(order_id) ON DELETE CASCADE,
    product_id      BIGINT NOT NULL REFERENCES products(product_id),
    quantity        INT NOT NULL,
    unit_price      DECIMAL(10,2) NOT NULL,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    tax_amount      DECIMAL(10,2) DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_items_order   ON order_items_recent(order_id);
CREATE INDEX IF NOT EXISTS idx_items_product ON order_items_recent(product_id);

-- Universal user-order lookup index
CREATE TABLE IF NOT EXISTS user_order_index (
    user_id          BIGINT NOT NULL,
    order_id         BIGINT NOT NULL,
    created_at       TIMESTAMP NOT NULL,
    tier             SMALLINT NOT NULL,
    archive_location VARCHAR(100),
    PRIMARY KEY (user_id, created_at DESC, order_id)
);
CREATE INDEX IF NOT EXISTS idx_uoi_order_id ON user_order_index(order_id);
CREATE INDEX IF NOT EXISTS idx_uoi_tier     ON user_order_index(tier);

-- Archive DB registry
CREATE TABLE IF NOT EXISTS archive_databases (
    id             SERIAL PRIMARY KEY,
    archive_year   INT NOT NULL,
    database_name  VARCHAR(100) NOT NULL,
    host           VARCHAR(255) NOT NULL,
    port           INT NOT NULL DEFAULT 5432,
    tier           SMALLINT NOT NULL,
    is_active      BOOLEAN DEFAULT TRUE,
    created_at     TIMESTAMP DEFAULT NOW()
);

-- Partition simulation
CREATE TABLE IF NOT EXISTS partition_simulation (
    id             SERIAL PRIMARY KEY,
    partition_date DATE NOT NULL,
    is_rotated     BOOLEAN DEFAULT FALSE,
    rotated_at     TIMESTAMP,
    records_moved  INT DEFAULT 0
);

-- Register archive databases
INSERT INTO archive_databases (archive_year, database_name, host, port, tier) VALUES
(2024, 'metadata_archive_db', 'metadata-archive-db', 5432, 3),
(2023, 'archive_2023',        'archive-2023',        5432, 4),
(2024, 'archive_2024',        'archive-2024',        5432, 4),
(2025, 'archive_2025',        'archive-2025',        5432, 4)
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Commit**

```bash
git add init-scripts/primary-init.sql
git commit -m "feat(infra): add primary DB schema init script with 30 products"
```

### Task 1A.3: SQL seed scripts — generate_series data

**Files:**

- Create: `init-scripts/primary-seed.sql`
- Create: `init-scripts/metadata-seed.sql`
- Create: `init-scripts/archive-init.sql`
- Create: `init-scripts/archive-2023-seed.sql`
- Create: `init-scripts/archive-2024-seed.sql`
- Create: `init-scripts/archive-2025-seed.sql`

- [ ] **Step 1: Hot tier seed (200K orders on primary)**

Create `init-scripts/primary-seed.sql`:

```sql
-- Insert 200K hot orders (last 90 days)
INSERT INTO orders_recent (user_id, order_number, total_amount, status, shipping_address, payment_method, payment_last4, coupon_code, created_at, updated_at)
SELECT
    (gs % 10000 + 1)::BIGINT,
    'ORD-HOT-' || lpad(gs::text, 8, '0'),
    round((50 + (gs % 9950))::numeric + 0.99, 2),
    (ARRAY['pending','confirmed','shipped','delivered','cancelled'])[1 + (gs % 5)],
    jsonb_build_object(
        'name',    'Customer ' || (gs % 10000 + 1),
        'line1',   (gs % 999 + 1)::text || ' MG Road',
        'city',    (ARRAY['Mumbai','Delhi','Bengaluru','Chennai','Hyderabad','Pune','Kolkata','Ahmedabad'])[1 + (gs % 8)],
        'state',   (ARRAY['MH','DL','KA','TN','TS','MH','WB','GJ'])[1 + (gs % 8)],
        'pincode', lpad(((gs % 900000) + 100000)::text, 6, '0'),
        'country', 'IN'
    ),
    (ARRAY['credit_card','upi','cod','wallet'])[1 + (gs % 4)],
    CASE WHEN gs % 4 = 0 THEN lpad((gs % 10000)::text, 4, '0') ELSE NULL END,
    CASE WHEN gs % 10 = 0 THEN 'SAVE' || (10 + gs % 30)::text ELSE NULL END,
    NOW() - ((gs % 90)::text || ' days')::INTERVAL - ((gs % 86400)::text || ' seconds')::INTERVAL,
    NOW() - ((gs % 90)::text || ' days')::INTERVAL
FROM generate_series(1, 200000) gs;

-- Insert items (3 items per order, 3 passes with different products)
INSERT INTO order_items_recent (order_id, product_id, quantity, unit_price, discount_amount, tax_amount, created_at)
SELECT
    o.order_id,
    ((o.order_id + pass - 1) % 30 + 1)::BIGINT,
    (1 + (o.order_id % 5))::INT,
    p.price,
    round((p.price * 0.05 * (o.order_id % 3))::numeric, 2),
    round((p.price * 0.18)::numeric, 2),
    o.created_at
FROM orders_recent o
CROSS JOIN generate_series(1, 3) pass
JOIN products p ON p.product_id = ((o.order_id + pass - 1) % 30 + 1);

-- Populate user_order_index for hot tier
INSERT INTO user_order_index (user_id, order_id, created_at, tier, archive_location)
SELECT user_id, order_id, created_at, 2, NULL
FROM orders_recent
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Metadata archive schema + seed (1M warm orders)**

Create `init-scripts/metadata-seed.sql`:

```sql
CREATE TABLE IF NOT EXISTS order_metadata_archive (
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
CREATE INDEX IF NOT EXISTS idx_meta_user_created ON order_metadata_archive(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_archive_loc  ON order_metadata_archive(archive_location);

-- 1M warm orders (2024 full year) — IDs start at 1000001
INSERT INTO order_metadata_archive (order_id, user_id, order_number, total_amount, status, payment_method, created_at, archive_location)
SELECT
    1000000 + gs,
    (gs % 10000 + 1)::BIGINT,
    'ORD-WRM-' || lpad(gs::text, 8, '0'),
    round((50 + (gs % 9950))::numeric + 0.49, 2),
    (ARRAY['delivered','cancelled','returned','delivered','delivered'])[1 + (gs % 5)],
    (ARRAY['credit_card','upi','cod','wallet'])[1 + (gs % 4)],
    TIMESTAMP '2024-01-01' + ((gs % 366)::text || ' days')::INTERVAL + ((gs % 86400)::text || ' seconds')::INTERVAL,
    'metadata_archive_db'
FROM generate_series(1, 1000000) gs;
```

- [ ] **Step 3: Cold archive schema (shared)**

Create `init-scripts/archive-init.sql`:

```sql
CREATE TABLE IF NOT EXISTS archived_orders (
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
CREATE INDEX IF NOT EXISTS idx_arch_user    ON archived_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_arch_created ON archived_orders(created_at);

CREATE TABLE IF NOT EXISTS archived_order_items (
    item_id         BIGINT PRIMARY KEY,
    order_id        BIGINT NOT NULL REFERENCES archived_orders(order_id),
    product_id      BIGINT NOT NULL,
    product_name    VARCHAR(255) NOT NULL,
    quantity        INT NOT NULL,
    unit_price      DECIMAL(10,2) NOT NULL,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    tax_amount      DECIMAL(10,2) DEFAULT 0,
    created_at      TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_arch_items_order ON archived_order_items(order_id);
```

- [ ] **Step 4: Cold archive seeds (2023: 700K, 2024: 650K, 2025: 450K)**

Create `init-scripts/archive-2023-seed.sql`:

```sql
\i /docker-entrypoint-initdb.d/archive-init.sql

INSERT INTO archived_orders (order_id, user_id, order_number, total_amount, status, shipping_address, payment_method, coupon_code, created_at)
SELECT
    2000000 + gs,
    (gs % 10000 + 1)::BIGINT,
    'ORD-C23-' || lpad(gs::text, 8, '0'),
    round((50 + (gs % 9950))::numeric + 0.99, 2),
    (ARRAY['delivered','cancelled','returned','delivered','delivered'])[1 + (gs % 5)],
    jsonb_build_object('name','Customer '||(gs%10000+1),'line1',gs||' Park Ave','city',(ARRAY['Mumbai','Delhi','Bengaluru','Chennai','Hyderabad'])[1+(gs%5)],'state',(ARRAY['MH','DL','KA','TN','TS'])[1+(gs%5)],'pincode',lpad(((gs%900000)+100000)::text,6,'0'),'country','IN'),
    (ARRAY['credit_card','upi','cod','wallet'])[1 + (gs % 4)],
    CASE WHEN gs % 15 = 0 THEN 'SAVE' || (10 + gs % 30)::text ELSE NULL END,
    TIMESTAMP '2023-01-01' + ((gs % 365)::text || ' days')::INTERVAL
FROM generate_series(1, 700000) gs;

INSERT INTO archived_order_items (item_id, order_id, product_id, product_name, quantity, unit_price, discount_amount, tax_amount, created_at)
SELECT
    (2000000 + o.gs) * 10 + pass,
    2000000 + o.gs,
    ((o.gs + pass) % 30 + 1)::BIGINT,
    'Product ' || (((o.gs + pass) % 30) + 1)::text,
    (1 + (o.gs % 4))::INT,
    round((100 + (o.gs % 5000))::numeric + 0.99, 2),
    round(((o.gs % 500))::numeric, 2),
    round(((o.gs % 1800))::numeric, 2),
    TIMESTAMP '2023-01-01' + ((o.gs % 365)::text || ' days')::INTERVAL
FROM generate_series(1, 700000) o(gs)
CROSS JOIN generate_series(1, 2) pass;
```

Create `init-scripts/archive-2024-seed.sql`:

```sql
\i /docker-entrypoint-initdb.d/archive-init.sql

INSERT INTO archived_orders (order_id, user_id, order_number, total_amount, status, shipping_address, payment_method, coupon_code, created_at)
SELECT
    3000000 + gs,
    (gs % 10000 + 1)::BIGINT,
    'ORD-C24-' || lpad(gs::text, 8, '0'),
    round((50 + (gs % 9950))::numeric + 0.49, 2),
    (ARRAY['delivered','cancelled','returned','delivered','delivered'])[1 + (gs % 5)],
    jsonb_build_object('name','Customer '||(gs%10000+1),'line1',gs||' Lake Rd','city',(ARRAY['Pune','Kolkata','Ahmedabad','Surat','Jaipur'])[1+(gs%5)],'state',(ARRAY['MH','WB','GJ','GJ','RJ'])[1+(gs%5)],'pincode',lpad(((gs%900000)+100000)::text,6,'0'),'country','IN'),
    (ARRAY['credit_card','upi','cod','wallet'])[1 + (gs % 4)],
    CASE WHEN gs % 12 = 0 THEN 'FLAT' || (50 + gs % 200)::text ELSE NULL END,
    TIMESTAMP '2024-01-01' + ((gs % 366)::text || ' days')::INTERVAL
FROM generate_series(1, 650000) gs;

INSERT INTO archived_order_items (item_id, order_id, product_id, product_name, quantity, unit_price, discount_amount, tax_amount, created_at)
SELECT
    (3000000 + o.gs) * 10 + pass,
    3000000 + o.gs,
    ((o.gs + pass) % 30 + 1)::BIGINT,
    'Product ' || (((o.gs + pass) % 30) + 1)::text,
    (1 + (o.gs % 3))::INT,
    round((100 + (o.gs % 5000))::numeric + 0.49, 2),
    round(((o.gs % 400))::numeric, 2),
    round(((o.gs % 1600))::numeric, 2),
    TIMESTAMP '2024-01-01' + ((o.gs % 366)::text || ' days')::INTERVAL
FROM generate_series(1, 650000) o(gs)
CROSS JOIN generate_series(1, 2) pass;
```

Create `init-scripts/archive-2025-seed.sql`:

```sql
\i /docker-entrypoint-initdb.d/archive-init.sql

INSERT INTO archived_orders (order_id, user_id, order_number, total_amount, status, shipping_address, payment_method, coupon_code, created_at)
SELECT
    4000000 + gs,
    (gs % 10000 + 1)::BIGINT,
    'ORD-C25-' || lpad(gs::text, 8, '0'),
    round((50 + (gs % 9950))::numeric + 0.79, 2),
    (ARRAY['delivered','shipped','confirmed','delivered','cancelled'])[1 + (gs % 5)],
    jsonb_build_object('name','Customer '||(gs%10000+1),'line1',gs||' Hill St','city',(ARRAY['Lucknow','Bhopal','Nagpur','Indore','Patna'])[1+(gs%5)],'state',(ARRAY['UP','MP','MH','MP','BR'])[1+(gs%5)],'pincode',lpad(((gs%900000)+100000)::text,6,'0'),'country','IN'),
    (ARRAY['credit_card','upi','cod','wallet'])[1 + (gs % 4)],
    CASE WHEN gs % 8 = 0 THEN 'NEW' || (20 + gs % 80)::text ELSE NULL END,
    TIMESTAMP '2025-01-01' + ((gs % 116)::text || ' days')::INTERVAL
FROM generate_series(1, 450000) gs;

INSERT INTO archived_order_items (item_id, order_id, product_id, product_name, quantity, unit_price, discount_amount, tax_amount, created_at)
SELECT
    (4000000 + o.gs) * 10 + pass,
    4000000 + o.gs,
    ((o.gs + pass) % 30 + 1)::BIGINT,
    'Product ' || (((o.gs + pass) % 30) + 1)::text,
    (1 + (o.gs % 3))::INT,
    round((100 + (o.gs % 5000))::numeric + 0.79, 2),
    round(((o.gs % 300))::numeric, 2),
    round(((o.gs % 1200))::numeric, 2),
    TIMESTAMP '2025-01-01' + ((o.gs % 116)::text || ' days')::INTERVAL
FROM generate_series(1, 450000) o(gs)
CROSS JOIN generate_series(1, 2) pass;
```

- [ ] **Step 5: Commit seed scripts**

```bash
git add init-scripts/
git commit -m "feat(infra): add generate_series seed scripts for all 5 DB tiers (~3M orders)"
```

### Task 1A.4: Update docker-compose.yml

**Files:**

- Modify: `docker-compose.yml`
- Modify: `.env.development`

- [ ] **Step 1: Replace docker-compose.yml**

Replace entire `docker-compose.yml` with:

```yaml
# Use: podman-compose up -d
# Runtime: Podman (drop-in Docker Compose YAML compatible)

services:
  # ─── Primary Database (Hot Tier — writes + strong reads) ──────────────────
  primary-db:
    image: postgres:16-alpine
    container_name: ecom-primary-db
    environment:
      POSTGRES_USER: ecom_user
      POSTGRES_PASSWORD: ecom_pass
      POSTGRES_DB: primary_db
    ports:
      - '5432:5432'
    volumes:
      - primary-data:/var/lib/postgresql/data
      - ./docker/postgres/primary.conf:/etc/postgresql/postgresql.conf:ro
      - ./docker/postgres/pg_hba.conf:/etc/postgresql/pg_hba.conf:ro
      - ./init-scripts/primary-init.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro
      - ./init-scripts/primary-seed.sql:/docker-entrypoint-initdb.d/02-seed.sql:ro
    command: postgres -c config_file=/etc/postgresql/postgresql.conf -c hba_file=/etc/postgresql/pg_hba.conf
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ecom_user -d primary_db']
      interval: 5s
      timeout: 5s
      retries: 10
    networks:
      - app-network

  # ─── Read Replica 1 ────────────────────────────────────────────────────────
  primary-replica-1:
    image: postgres:16-alpine
    container_name: ecom-replica-1
    environment:
      POSTGRES_USER: ecom_user
      POSTGRES_PASSWORD: ecom_pass
      POSTGRES_DB: primary_db
      PRIMARY_HOST: primary-db
      REPLICATION_USER: replicator
      REPLICATION_PASSWORD: replicator_pass
    ports:
      - '5433:5432'
    volumes:
      - replica-1-data:/var/lib/postgresql/data
      - ./docker/postgres/replica-entrypoint.sh:/docker-entrypoint-initdb.d/replica-setup.sh:ro
    entrypoint: ['/bin/bash', '/docker-entrypoint-initdb.d/replica-setup.sh']
    depends_on:
      primary-db:
        condition: service_healthy
    networks:
      - app-network

  # ─── Read Replica 2 ────────────────────────────────────────────────────────
  primary-replica-2:
    image: postgres:16-alpine
    container_name: ecom-replica-2
    environment:
      POSTGRES_USER: ecom_user
      POSTGRES_PASSWORD: ecom_pass
      POSTGRES_DB: primary_db
      PRIMARY_HOST: primary-db
      REPLICATION_USER: replicator
      REPLICATION_PASSWORD: replicator_pass
    ports:
      - '5434:5432'
    volumes:
      - replica-2-data:/var/lib/postgresql/data
      - ./docker/postgres/replica-entrypoint.sh:/docker-entrypoint-initdb.d/replica-setup.sh:ro
    entrypoint: ['/bin/bash', '/docker-entrypoint-initdb.d/replica-setup.sh']
    depends_on:
      primary-db:
        condition: service_healthy
    networks:
      - app-network

  # ─── Metadata Archive DB (Warm Tier — 2024 lightweight metadata) ───────────
  metadata-archive-db:
    image: postgres:16-alpine
    container_name: ecom-metadata-archive
    environment:
      POSTGRES_USER: ecom_user
      POSTGRES_PASSWORD: ecom_pass
      POSTGRES_DB: metadata_archive_db
    ports:
      - '5435:5432'
    volumes:
      - metadata-data:/var/lib/postgresql/data
      - ./init-scripts/metadata-seed.sql:/docker-entrypoint-initdb.d/01-seed.sql:ro
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ecom_user -d metadata_archive_db']
      interval: 5s
      timeout: 5s
      retries: 10
    networks:
      - app-network

  # ─── Cold Archive 2023 ─────────────────────────────────────────────────────
  archive-2023:
    image: postgres:16-alpine
    container_name: ecom-archive-2023
    environment:
      POSTGRES_USER: ecom_user
      POSTGRES_PASSWORD: ecom_pass
      POSTGRES_DB: archive_2023
    ports:
      - '5436:5432'
    volumes:
      - archive-2023-data:/var/lib/postgresql/data
      - ./init-scripts/archive-init.sql:/docker-entrypoint-initdb.d/00-schema.sql:ro
      - ./init-scripts/archive-2023-seed.sql:/docker-entrypoint-initdb.d/01-seed.sql:ro
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ecom_user -d archive_2023']
      interval: 5s
      timeout: 5s
      retries: 10
    networks:
      - app-network

  # ─── Cold Archive 2024 ─────────────────────────────────────────────────────
  archive-2024:
    image: postgres:16-alpine
    container_name: ecom-archive-2024
    environment:
      POSTGRES_USER: ecom_user
      POSTGRES_PASSWORD: ecom_pass
      POSTGRES_DB: archive_2024
    ports:
      - '5437:5432'
    volumes:
      - archive-2024-data:/var/lib/postgresql/data
      - ./init-scripts/archive-init.sql:/docker-entrypoint-initdb.d/00-schema.sql:ro
      - ./init-scripts/archive-2024-seed.sql:/docker-entrypoint-initdb.d/01-seed.sql:ro
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ecom_user -d archive_2024']
      interval: 5s
      timeout: 5s
      retries: 10
    networks:
      - app-network

  # ─── Cold Archive 2025 ─────────────────────────────────────────────────────
  archive-2025:
    image: postgres:16-alpine
    container_name: ecom-archive-2025
    environment:
      POSTGRES_USER: ecom_user
      POSTGRES_PASSWORD: ecom_pass
      POSTGRES_DB: archive_2025
    ports:
      - '5438:5432'
    volumes:
      - archive-2025-data:/var/lib/postgresql/data
      - ./init-scripts/archive-init.sql:/docker-entrypoint-initdb.d/00-schema.sql:ro
      - ./init-scripts/archive-2025-seed.sql:/docker-entrypoint-initdb.d/01-seed.sql:ro
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ecom_user -d archive_2025']
      interval: 5s
      timeout: 5s
      retries: 10
    networks:
      - app-network

  # ─── Redis Cache ───────────────────────────────────────────────────────────
  redis:
    image: redis:7-alpine
    container_name: ecom-redis
    ports:
      - '6379:6379'
    volumes:
      - redis-data:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - app-network

  # ─── NestJS Application ────────────────────────────────────────────────────
  app:
    build:
      context: .
      dockerfile: docker/Dockerfile
      target: development
    container_name: ecom-app
    command:
      - sh
      - -c
      - |
        npx prisma migrate deploy --schema=src/database/prisma/schema.prisma && \
        npm run start:dev
    environment:
      APP_PORT: ${APP_PORT:-3000}
    ports:
      - '${APP_PORT:-3000}:${APP_PORT:-3000}'
    volumes:
      - .:/app
      - /app/node_modules
    env_file:
      - .env.development
    depends_on:
      primary-db:
        condition: service_healthy
      metadata-archive-db:
        condition: service_healthy
      archive-2023:
        condition: service_healthy
      redis:
        condition: service_healthy
      otel-collector:
        condition: service_started
    networks:
      - app-network

  # ─── Observability Stack (unchanged) ──────────────────────────────────────
  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.103.0
    command: ['--config=/etc/otel-collector-config.yml']
    environment:
      TEMPO_OTLP_GRPC_ENDPOINT: ${TEMPO_OTLP_GRPC_ENDPOINT:-tempo:4317}
      LOKI_OTLP_ENDPOINT: ${LOKI_OTLP_ENDPOINT:-http://loki:3100/otlp}
      PROMETHEUS_REMOTE_WRITE_URL: ${PROMETHEUS_REMOTE_WRITE_URL:-http://prometheus:9090/api/v1/write}
    volumes:
      - ./docker/grafana/otel-collector-config.yml:/etc/otel-collector-config.yml:ro
    ports:
      - '4317:4317'
      - '4318:4318'
    depends_on:
      - tempo
      - loki
    networks:
      - app-network
    restart: unless-stopped

  tempo:
    image: grafana/tempo:2.5.0
    command: ['-config.file=/etc/tempo.yml', '-config.expand-env=true']
    environment:
      PROMETHEUS_REMOTE_WRITE_URL: ${PROMETHEUS_REMOTE_WRITE_URL:-http://prometheus:9090/api/v1/write}
    volumes:
      - ./docker/grafana/tempo.yml:/etc/tempo.yml:ro
      - tempo-data:/var/tempo
    ports:
      - '3200:3200'
    networks:
      - app-network
    restart: unless-stopped

  loki:
    image: grafana/loki:3.1.0
    command: ['-config.file=/etc/loki/loki.yml']
    volumes:
      - ./docker/grafana/loki.yml:/etc/loki/loki.yml:ro
      - loki-data:/tmp/loki
    ports:
      - '3100:3100'
    networks:
      - app-network
    restart: unless-stopped

  prometheus:
    image: prom/prometheus:v2.53.0
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=15d'
      - '--web.enable-remote-write-receiver'
      - '--web.enable-lifecycle'
    volumes:
      - ./docker/grafana/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus-data:/prometheus
    ports:
      - '9090:9090'
    networks:
      - app-network
    restart: unless-stopped

  grafana:
    image: grafana/grafana:12.0.0
    environment:
      GF_AUTH_ANONYMOUS_ENABLED: 'true'
      GF_AUTH_ANONYMOUS_ORG_ROLE: Admin
      GF_AUTH_DISABLE_LOGIN_FORM: 'true'
      GF_FEATURE_TOGGLES_ENABLE: traceqlEditor traceToMetrics
      GF_INSTALL_PLUGINS: grafana-exploretraces-app,grafana-lokiexplore-app
      PROMETHEUS_URL: ${PROMETHEUS_URL:-http://prometheus:9090}
      TEMPO_URL: ${TEMPO_URL:-http://tempo:3200}
      LOKI_URL: ${LOKI_URL:-http://loki:3100}
    volumes:
      - ./docker/grafana/provisioning:/etc/grafana/provisioning:ro
      - grafana-data:/var/lib/grafana
    ports:
      - '3001:3000'
    networks:
      - app-network
    restart: unless-stopped

networks:
  app-network:
    driver: bridge

volumes:
  primary-data:
  replica-1-data:
  replica-2-data:
  metadata-data:
  archive-2023-data:
  archive-2024-data:
  archive-2025-data:
  redis-data:
  tempo-data:
  loki-data:
  prometheus-data:
  grafana-data:
```

- [ ] **Step 2: Update .env.development**

Replace `.env.development`:

```env
# =============================================================================
# Application
# =============================================================================
NODE_ENV=development
APP_NAME=order-management
APP_PORT=3000
APP_HOST=0.0.0.0
API_PREFIX=api
API_VERSION=1
LOG_LEVEL=debug

# =============================================================================
# Primary Database (Hot Tier + Migrations)
# =============================================================================
DATABASE_URL=postgresql://ecom_user:ecom_pass@primary-db:5432/primary_db?schema=public
DB_PRIMARY_HOST=primary-db
DB_PRIMARY_PORT=5432
DB_PRIMARY_NAME=primary_db
DB_PRIMARY_USER=ecom_user
DB_PRIMARY_PASSWORD=ecom_pass

# Read Replicas
DB_REPLICA_1_HOST=primary-replica-1
DB_REPLICA_1_PORT=5432
DB_REPLICA_2_HOST=primary-replica-2
DB_REPLICA_2_PORT=5432

# Metadata Archive (Warm Tier)
DB_METADATA_HOST=metadata-archive-db
DB_METADATA_PORT=5432
DB_METADATA_NAME=metadata_archive_db
DB_METADATA_USER=ecom_user
DB_METADATA_PASSWORD=ecom_pass

# Redis Cache
REDIS_HOST=redis
REDIS_PORT=6379

# =============================================================================
# OpenTelemetry
# =============================================================================
OTEL_ENABLED=true
OTEL_SERVICE_NAME=order-management
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
OTEL_EXPORTER_OTLP_PROTOCOL=grpc

# =============================================================================
# CORS / Shutdown
# =============================================================================
CORS_ORIGINS=http://localhost:3000
SHUTDOWN_TIMEOUT_MS=10000
```

- [ ] **Step 3: Commit infrastructure changes**

```bash
git add docker-compose.yml .env.development
git commit -m "feat(infra): add 7-postgres + redis podman-compose with streaming replication"
```

---

## Phase 1B — Database Layer Track (worktree: `feat/om-database`)

> Spawn worktree: `git worktree add ../om-database feat/om-database`

### Task 1B.1: Extend env schema for multi-DB vars

**Files:**

- Modify: `src/config/schemas/env.schema.ts`

- [ ] **Step 1: Add multi-DB env vars to schema**

In `src/config/schemas/env.schema.ts`, replace `databaseConfigSchema` and add:

```typescript
export const databaseConfigSchema = z.object({
  DATABASE_URL: z.string().url(),

  DB_PRIMARY_HOST: z.string().default('localhost'),
  DB_PRIMARY_PORT: z.coerce.number().int().positive().default(5432),
  DB_PRIMARY_NAME: z.string().default('primary_db'),
  DB_PRIMARY_USER: z.string().default('ecom_user'),
  DB_PRIMARY_PASSWORD: z.string().default('ecom_pass'),

  DB_REPLICA_1_HOST: z.string().default('localhost'),
  DB_REPLICA_1_PORT: z.coerce.number().int().positive().default(5433),
  DB_REPLICA_2_HOST: z.string().default('localhost'),
  DB_REPLICA_2_PORT: z.coerce.number().int().positive().default(5434),

  DB_METADATA_HOST: z.string().default('localhost'),
  DB_METADATA_PORT: z.coerce.number().int().positive().default(5435),
  DB_METADATA_NAME: z.string().default('metadata_archive_db'),
  DB_METADATA_USER: z.string().default('ecom_user'),
  DB_METADATA_PASSWORD: z.string().default('ecom_pass'),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
});
```

Also update `appConfigSchema` to change the default app name:

```typescript
APP_NAME: z.string().default('order-management'),
```

- [ ] **Step 2: Commit**

```bash
git add src/config/schemas/env.schema.ts
git commit -m "feat(config): extend env schema with multi-DB and Redis vars"
```

### Task 1B.2: Implement MultiDbService

**Files:**

- Create: `src/database/multi-db.service.ts`

- [ ] **Step 1: Write MultiDbService with round-robin replica routing**

Create `src/database/multi-db.service.ts`:

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { AppConfigService } from '@config/config.service';
import { AppLogger } from '@logger/logger.delegate';
import { PoolConfig } from '@database/interfaces';

@Injectable()
export class MultiDbService implements OnModuleInit, OnModuleDestroy {
  private primaryPool: Pool;
  private replicaPools: Pool[] = [];
  private metadataPool: Pool;
  private archivePools = new Map<string, Pool>();
  private replicaCounter = 0;

  constructor(
    private readonly config: AppConfigService,
    private readonly logger: AppLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    const cfg = this.config.get;

    this.primaryPool = this.createPool({
      host: cfg('DB_PRIMARY_HOST'),
      port: cfg('DB_PRIMARY_PORT'),
      database: cfg('DB_PRIMARY_NAME'),
      user: cfg('DB_PRIMARY_USER'),
      password: cfg('DB_PRIMARY_PASSWORD'),
      max: 20,
    });

    this.replicaPools = [
      this.createPool({
        host: cfg('DB_REPLICA_1_HOST'),
        port: cfg('DB_REPLICA_1_PORT'),
        database: cfg('DB_PRIMARY_NAME'),
        user: cfg('DB_PRIMARY_USER'),
        password: cfg('DB_PRIMARY_PASSWORD'),
        max: 15,
      }),
      this.createPool({
        host: cfg('DB_REPLICA_2_HOST'),
        port: cfg('DB_REPLICA_2_PORT'),
        database: cfg('DB_PRIMARY_NAME'),
        user: cfg('DB_PRIMARY_USER'),
        password: cfg('DB_PRIMARY_PASSWORD'),
        max: 15,
      }),
    ];

    this.metadataPool = this.createPool({
      host: cfg('DB_METADATA_HOST'),
      port: cfg('DB_METADATA_PORT'),
      database: cfg('DB_METADATA_NAME'),
      user: cfg('DB_METADATA_USER'),
      password: cfg('DB_METADATA_PASSWORD'),
      max: 10,
    });

    await this.verifyPool(this.primaryPool, 'primary');
    this.logger.logEvent('db.pools.initialized', {
      attributes: { pools: ['primary', 'replica-1', 'replica-2', 'metadata'] },
    });
  }

  async onModuleDestroy(): Promise<void> {
    const all = [
      this.primaryPool,
      ...this.replicaPools,
      this.metadataPool,
      ...this.archivePools.values(),
    ];
    await Promise.allSettled(all.map(p => p.end()));
    this.logger.logEvent('db.pools.closed');
  }

  /** Write path — always primary. */
  getPrimaryPool(): Pool {
    return this.primaryPool;
  }

  /** Read path — round-robin across 2 replicas. Falls back to primary if replicas unavailable. */
  getReadPool(): Pool {
    if (this.replicaPools.length === 0) return this.primaryPool;
    const idx = this.replicaCounter % this.replicaPools.length;
    this.replicaCounter = (this.replicaCounter + 1) % this.replicaPools.length;
    return this.replicaPools[idx];
  }

  /** Warm tier — metadata archive DB. */
  getMetadataPool(): Pool {
    return this.metadataPool;
  }

  /** Cold tier — lazily initialised pool keyed by DB name. */
  getArchivePool(host: string, port: number, database: string): Pool {
    const key = `${host}:${port}:${database}`;
    if (!this.archivePools.has(key)) {
      const cfg = this.config.get;
      this.archivePools.set(
        key,
        this.createPool({
          host,
          port,
          database,
          user: cfg('DB_PRIMARY_USER'),
          password: cfg('DB_PRIMARY_PASSWORD'),
          max: 5,
        }),
      );
      this.logger.logEvent('db.archive-pool.created', { attributes: { key } });
    }
    return this.archivePools.get(key)!;
  }

  private createPool(cfg: PoolConfig): Pool {
    return new Pool({
      host: cfg.host,
      port: cfg.port,
      database: cfg.database,
      user: cfg.user,
      password: cfg.password,
      max: cfg.max ?? 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }

  private async verifyPool(pool: Pool, name: string): Promise<void> {
    const client: PoolClient = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    this.logger.logEvent('db.pool.verified', { attributes: { name } });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/database/multi-db.service.ts
git commit -m "feat(database): add MultiDbService with round-robin replica routing"
```

### Task 1B.3: Implement ArchiveRegistryService

**Files:**

- Create: `src/database/archive-registry.service.ts`

- [ ] **Step 1: Write ArchiveRegistryService**

Create `src/database/archive-registry.service.ts`:

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { MultiDbService } from '@database/multi-db.service';
import { AppLogger } from '@logger/logger.delegate';
import { ArchiveDbConfig } from '@database/interfaces';

@Injectable()
export class ArchiveRegistryService implements OnModuleInit {
  private registry = new Map<number, ArchiveDbConfig[]>();

  constructor(
    private readonly db: MultiDbService,
    private readonly logger: AppLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.loadRegistry();
  }

  async loadRegistry(): Promise<void> {
    const pool = this.db.getPrimaryPool();
    const result = await pool.query<ArchiveDbConfig>(
      `SELECT id, archive_year AS "archiveYear", database_name AS "databaseName",
              host, port, tier, is_active AS "isActive"
       FROM archive_databases WHERE is_active = true ORDER BY archive_year`,
    );
    this.registry.clear();
    for (const row of result.rows) {
      const year = row.archiveYear;
      if (!this.registry.has(year)) this.registry.set(year, []);
      this.registry.get(year)!.push(row);
    }
    this.logger.logEvent('archive-registry.loaded', {
      attributes: { entries: result.rowCount ?? 0 },
    });
  }

  getArchiveForYear(year: number, tier: 3 | 4): ArchiveDbConfig | undefined {
    return this.registry.get(year)?.find(a => a.tier === tier);
  }

  getPoolForArchive(cfg: ArchiveDbConfig): Pool {
    return this.db.getArchivePool(cfg.host, cfg.port, cfg.databaseName);
  }

  getPoolForYear(year: number, tier: 3 | 4): Pool | undefined {
    const cfg = this.getArchiveForYear(year, tier);
    return cfg ? this.getPoolForArchive(cfg) : undefined;
  }

  getAllArchives(): Map<number, ArchiveDbConfig[]> {
    return this.registry;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/database/archive-registry.service.ts
git commit -m "feat(database): add ArchiveRegistryService for year→pool routing"
```

### Task 1B.4: Update Prisma schema and rewire DatabaseModule

**Files:**

- Modify: `src/database/prisma/schema.prisma`
- Modify: `src/database/database.module.ts`
- Delete Twitter-domain DB files

- [ ] **Step 1: Replace Prisma schema with order domain (migrations only)**

Replace `src/database/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Prisma is used ONLY for schema migrations on the primary DB.
// Runtime queries use raw pg pools via MultiDbService.
// These models mirror the SQL in init-scripts/primary-init.sql.

model Product {
  productId         BigInt @id @default(autoincrement()) @map("product_id")
  name              String @db.VarChar(255)
  sku               String @unique @db.VarChar(50)
  category          String @db.VarChar(100)
  price             Decimal @db.Decimal(10, 2)
  brand             String? @db.VarChar(100)
  totalOrdersCount  Int @default(0) @map("total_orders_count")
  recentOrdersCount Int @default(0) @map("recent_orders_count")

  @@map("products")
}

model OrderRecent {
  orderId         BigInt   @id @default(autoincrement()) @map("order_id")
  userId          BigInt   @map("user_id")
  orderNumber     String   @unique @map("order_number") @db.VarChar(50)
  totalAmount     Decimal  @map("total_amount") @db.Decimal(10, 2)
  status          String   @db.VarChar(20)
  shippingAddress Json     @map("shipping_address")
  paymentMethod   String   @map("payment_method") @db.VarChar(20)
  paymentLast4    String?  @map("payment_last4") @db.VarChar(4)
  couponCode      String?  @map("coupon_code") @db.VarChar(50)
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  items OrderItemRecent[]

  @@index([userId, createdAt(sort: Desc)])
  @@map("orders_recent")
}

model OrderItemRecent {
  itemId         BigInt   @id @default(autoincrement()) @map("item_id")
  orderId        BigInt   @map("order_id")
  productId      BigInt   @map("product_id")
  quantity       Int
  unitPrice      Decimal  @map("unit_price") @db.Decimal(10, 2)
  discountAmount Decimal  @default(0) @map("discount_amount") @db.Decimal(10, 2)
  taxAmount      Decimal  @default(0) @map("tax_amount") @db.Decimal(10, 2)
  createdAt      DateTime @default(now()) @map("created_at")

  order   OrderRecent @relation(fields: [orderId], references: [orderId], onDelete: Cascade)

  @@index([orderId])
  @@map("order_items_recent")
}

model UserOrderIndex {
  userId          BigInt   @map("user_id")
  orderId         BigInt   @map("order_id")
  createdAt       DateTime @map("created_at")
  tier            Int
  archiveLocation String?  @map("archive_location") @db.VarChar(100)

  @@id([userId, createdAt, orderId])
  @@index([orderId])
  @@map("user_order_index")
}

model ArchiveDatabase {
  id           Int      @id @default(autoincrement())
  archiveYear  Int      @map("archive_year")
  databaseName String   @map("database_name") @db.VarChar(100)
  host         String   @db.VarChar(255)
  port         Int      @default(5432)
  tier         Int
  isActive     Boolean  @default(true) @map("is_active")
  createdAt    DateTime @default(now()) @map("created_at")

  @@map("archive_databases")
}

model PartitionSimulation {
  id            Int       @id @default(autoincrement())
  partitionDate DateTime  @map("partition_date") @db.Date
  isRotated     Boolean   @default(false) @map("is_rotated")
  rotatedAt     DateTime? @map("rotated_at")
  recordsMoved  Int       @default(0) @map("records_moved")

  @@map("partition_simulation")
}
```

- [ ] **Step 2: Delete Twitter-domain DB directories**

```bash
rm -rf src/database/companies \
       src/database/departments \
       src/database/tweets \
       src/database/users \
       src/database/extensions \
       src/database/base.repository.ts \
       src/database/types.ts
```

- [ ] **Step 3: Rewrite database.module.ts**

Replace `src/database/database.module.ts`:

```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '@database/prisma.module';
import { MultiDbService } from '@database/multi-db.service';
import { ArchiveRegistryService } from '@database/archive-registry.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [MultiDbService, ArchiveRegistryService],
  exports: [MultiDbService, ArchiveRegistryService],
})
export class DatabaseModule {}
```

- [ ] **Step 4: Delete old database.service.ts (replaced by MultiDbService)**

```bash
rm src/database/database.service.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/database/ src/database/prisma/schema.prisma
git commit -m "feat(database): replace Twitter DB layer with order-domain multi-pool setup"
```

### Task 1B.5: Update app.module.ts

**Files:**

- Modify: `src/app.module.ts`

- [ ] **Step 1: Rewrite app.module.ts for order domain**

Replace `src/app.module.ts`:

```typescript
import { Module, MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppConfigModule } from '@config/config.module';
import { DatabaseModule } from '@database/database.module';
import { AppLoggerModule } from '@logger/logger.module';
import { TelemetryModule } from '@telemetry/telemetry.module';
import { AllExceptionsFilter } from '@common/filters/all-exceptions.filter';
import { RequestIdMiddleware } from '@common/middleware/request-id.middleware';
import { SecurityHeadersMiddleware } from '@common/middleware/security-headers.middleware';
import { MockAuthMiddleware } from '@common/middleware/mock-auth.middleware';
import { AppClsModule } from '@common/cls/cls.module';
import { AuthContextGuard } from '@common/guards/auth-context.guard';
import { OrdersModule } from '@modules/orders/orders.module';
import { ArchivalModule } from '@modules/archival/archival.module';
import { MockDataModule } from '@modules/mock-data/mock-data.module';

@Module({
  imports: [
    AppClsModule,
    AppConfigModule,
    AppLoggerModule,
    DatabaseModule,
    TelemetryModule,
    OrdersModule,
    ArchivalModule,
    MockDataModule,
  ],
  providers: [AllExceptionsFilter, { provide: APP_GUARD, useClass: AuthContextGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware, SecurityHeadersMiddleware, MockAuthMiddleware)
      .forRoutes({ path: '*splat', method: RequestMethod.ALL });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app.module.ts
git commit -m "feat(app): wire order management modules, remove Twitter modules"
```

---

## Phase 1C — Orders Module Track (worktree: `feat/om-orders`)

> Spawn worktree: `git worktree add ../om-orders feat/om-orders`

### Task 1C.1: Orders DTOs and interfaces

**Files:**

- Create: `src/modules/orders/dto/create-order.dto.ts`
- Create: `src/modules/orders/dto/query-orders.dto.ts`
- Create: `src/modules/orders/interfaces/order-response.interface.ts`

- [ ] **Step 1: Create DTOs**

Create `src/modules/orders/dto/create-order.dto.ts`:

```typescript
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

const shippingAddressSchema = z.object({
  name: z.string().min(1).max(100),
  line1: z.string().min(1).max(255),
  city: z.string().min(1).max(100),
  state: z.string().min(2).max(50),
  pincode: z.string().regex(/^\d{6}$/),
  country: z.string().length(2).default('IN'),
});

const orderItemSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().positive().max(100),
});

export const createOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1).max(20),
  shippingAddress: shippingAddressSchema,
  paymentMethod: z.enum(['credit_card', 'upi', 'cod', 'wallet']),
  paymentLast4: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  couponCode: z.string().max(50).optional(),
});

export type CreateOrderDto = z.infer<typeof createOrderSchema>;
```

Create `src/modules/orders/dto/query-orders.dto.ts`:

```typescript
import { z } from 'zod';

export const queryOrdersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type QueryOrdersDto = z.infer<typeof queryOrdersSchema>;
```

Create `src/modules/orders/interfaces/order-response.interface.ts`:

```typescript
export interface OrderItem {
  itemId: string;
  productId: string;
  productName?: string;
  quantity: number;
  unitPrice: string;
  discountAmount: string;
  taxAmount: string;
}

export interface Order {
  orderId: string;
  userId: string;
  orderNumber: string;
  totalAmount: string;
  status: string;
  shippingAddress: Record<string, unknown>;
  paymentMethod: string;
  paymentLast4?: string;
  couponCode?: string;
  createdAt: Date;
  tier: 2 | 3 | 4;
  tierName: 'hot' | 'warm' | 'cold';
  archiveLocation?: string;
  items?: OrderItem[];
}

export interface PaginatedOrders {
  orders: Order[];
  total: number;
  page: number;
  limit: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/orders/dto/ src/modules/orders/interfaces/
git commit -m "feat(orders): add DTOs and response interfaces"
```

### Task 1C.2: OrdersRepository

**Files:**

- Create: `src/modules/orders/orders.repository.ts`

- [ ] **Step 1: Write OrdersRepository with raw SQL**

Create `src/modules/orders/orders.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { MultiDbService } from '@database/multi-db.service';
import { ArchiveRegistryService } from '@database/archive-registry.service';
import { UserOrderIndexEntry, OrderRow, OrderItemRow, OrderWithItems } from '@database/interfaces';
import { CreateOrderDto } from './dto/create-order.dto';
import { Order, PaginatedOrders } from './interfaces/order-response.interface';

@Injectable()
export class OrdersRepository {
  constructor(
    private readonly db: MultiDbService,
    private readonly registry: ArchiveRegistryService,
  ) {}

  async findIndexByUser(
    userId: number,
    limit: number,
    offset: number,
  ): Promise<{ entries: UserOrderIndexEntry[]; total: number }> {
    const pool = this.db.getReadPool();
    const [dataResult, countResult] = await Promise.all([
      pool.query<UserOrderIndexEntry>(
        `SELECT user_id AS "userId", order_id AS "orderId", created_at AS "createdAt",
                tier, archive_location AS "archiveLocation"
         FROM user_order_index
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset],
      ),
      pool.query<{ total: string }>(
        'SELECT COUNT(*) AS total FROM user_order_index WHERE user_id = $1',
        [userId],
      ),
    ]);
    return {
      entries: dataResult.rows,
      total: parseInt(countResult.rows[0].total, 10),
    };
  }

  async findHotOrders(orderIds: bigint[]): Promise<OrderWithItems[]> {
    if (orderIds.length === 0) return [];
    const pool = this.db.getReadPool();
    const result = await pool.query<OrderRow>(
      `SELECT o.order_id, o.user_id, o.order_number, o.total_amount, o.status,
              o.shipping_address, o.payment_method, o.payment_last4, o.coupon_code, o.created_at, o.updated_at
       FROM orders_recent o
       WHERE o.order_id = ANY($1)`,
      [orderIds],
    );
    const itemsResult = await pool.query<OrderItemRow>(
      `SELECT item_id, order_id, product_id, quantity, unit_price, discount_amount, tax_amount, created_at
       FROM order_items_recent WHERE order_id = ANY($1)`,
      [orderIds],
    );
    const itemsByOrder = new Map<string, OrderItemRow[]>();
    for (const item of itemsResult.rows) {
      const key = item.order_id.toString();
      if (!itemsByOrder.has(key)) itemsByOrder.set(key, []);
      itemsByOrder.get(key)!.push(item);
    }
    return result.rows.map(o => ({
      ...o,
      items: itemsByOrder.get(o.order_id.toString()) ?? [],
      tier: 2 as const,
      tierName: 'hot' as const,
    }));
  }

  async findWarmOrders(orderIds: bigint[]): Promise<OrderWithItems[]> {
    if (orderIds.length === 0) return [];
    const pool = this.db.getMetadataPool();
    const result = await pool.query<OrderRow>(
      `SELECT order_id, user_id, order_number, total_amount, status,
              '{}'::jsonb AS shipping_address, payment_method, NULL AS payment_last4,
              NULL AS coupon_code, created_at, archived_at AS updated_at
       FROM order_metadata_archive WHERE order_id = ANY($1)`,
      [orderIds],
    );
    return result.rows.map(o => ({
      ...o,
      items: [],
      tier: 3 as const,
      tierName: 'warm' as const,
      archive_location: 'metadata_archive_db',
    }));
  }

  async findColdOrders(entries: UserOrderIndexEntry[]): Promise<OrderWithItems[]> {
    if (entries.length === 0) return [];
    const byLocation = new Map<string, bigint[]>();
    for (const e of entries) {
      if (!e.archiveLocation) continue;
      if (!byLocation.has(e.archiveLocation)) byLocation.set(e.archiveLocation, []);
      byLocation.get(e.archiveLocation)!.push(e.orderId);
    }

    const promises = Array.from(byLocation.entries()).map(async ([location, ids]) => {
      const year = parseInt(location.replace('archive_', ''), 10);
      const pool = this.registry.getPoolForYear(year, 4);
      if (!pool) return [];
      const [ordersRes, itemsRes] = await Promise.all([
        pool.query<OrderRow>(
          `SELECT order_id, user_id, order_number, total_amount, status,
                  shipping_address, payment_method, coupon_code, created_at
           FROM archived_orders WHERE order_id = ANY($1)`,
          [ids],
        ),
        pool.query<OrderItemRow>(
          `SELECT item_id, order_id, product_id, product_name, quantity,
                  unit_price, discount_amount, tax_amount, created_at
           FROM archived_order_items WHERE order_id = ANY($1)`,
          [ids],
        ),
      ]);
      const itemsByOrder = new Map<string, OrderItemRow[]>();
      for (const item of itemsRes.rows) {
        const key = item.order_id.toString();
        if (!itemsByOrder.has(key)) itemsByOrder.set(key, []);
        itemsByOrder.get(key)!.push(item);
      }
      return ordersRes.rows.map(o => ({
        ...o,
        items: itemsByOrder.get(o.order_id.toString()) ?? [],
        tier: 4 as const,
        tierName: 'cold' as const,
        archive_location: location,
      }));
    });

    return (await Promise.all(promises)).flat();
  }

  async findOrderById(orderId: bigint): Promise<OrderWithItems | null> {
    // Check user_order_index to find the tier
    const pool = this.db.getReadPool();
    const indexResult = await pool.query<UserOrderIndexEntry>(
      `SELECT user_id AS "userId", order_id AS "orderId", created_at AS "createdAt",
              tier, archive_location AS "archiveLocation"
       FROM user_order_index WHERE order_id = $1 LIMIT 1`,
      [orderId],
    );
    if (indexResult.rows.length === 0) return null;
    const entry = indexResult.rows[0];

    if (entry.tier === 2) {
      const results = await this.findHotOrders([orderId]);
      return results[0] ?? null;
    }
    if (entry.tier === 3) {
      const results = await this.findWarmOrders([orderId]);
      return results[0] ?? null;
    }
    const results = await this.findColdOrders([entry]);
    return results[0] ?? null;
  }

  async createOrder(userId: number, dto: CreateOrderDto): Promise<{ orderId: bigint }> {
    const pool = this.db.getPrimaryPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Fetch product prices
      const productIds = dto.items.map(i => i.productId);
      const productsRes = await client.query<{ product_id: string; price: string; name: string }>(
        'SELECT product_id, price, name FROM products WHERE product_id = ANY($1)',
        [productIds],
      );
      const productMap = new Map(productsRes.rows.map(p => [parseInt(p.product_id, 10), p]));

      const totalAmount = dto.items.reduce((sum, item) => {
        const product = productMap.get(item.productId);
        return sum + (product ? parseFloat(product.price) * item.quantity : 0);
      }, 0);

      const orderNumber = `ORD-${Date.now()}-${userId}`;
      const orderRes = await client.query<{ order_id: bigint }>(
        `INSERT INTO orders_recent
           (user_id, order_number, total_amount, status, shipping_address, payment_method, payment_last4, coupon_code)
         VALUES ($1,$2,$3,'pending',$4,$5,$6,$7)
         RETURNING order_id`,
        [
          userId,
          orderNumber,
          totalAmount.toFixed(2),
          JSON.stringify(dto.shippingAddress),
          dto.paymentMethod,
          dto.paymentLast4 ?? null,
          dto.couponCode ?? null,
        ],
      );
      const orderId = orderRes.rows[0].order_id;

      for (const item of dto.items) {
        const product = productMap.get(item.productId)!;
        const unitPrice = parseFloat(product.price);
        const tax = parseFloat((unitPrice * 0.18).toFixed(2));
        await client.query(
          `INSERT INTO order_items_recent (order_id, product_id, quantity, unit_price, tax_amount)
           VALUES ($1,$2,$3,$4,$5)`,
          [orderId, item.productId, item.quantity, unitPrice, tax],
        );
      }

      await client.query(
        `INSERT INTO user_order_index (user_id, order_id, created_at, tier)
         VALUES ($1,$2,NOW(),2)`,
        [userId, orderId],
      );

      await client.query('COMMIT');
      return { orderId };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/orders/orders.repository.ts
git commit -m "feat(orders): add OrdersRepository with raw SQL multi-tier queries"
```

### Task 1C.3: OrdersService

**Files:**

- Create: `src/modules/orders/orders.service.ts`

- [ ] **Step 1: Write OrdersService**

Create `src/modules/orders/orders.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { OrdersRepository } from './orders.repository';
import { CreateOrderDto } from './dto/create-order.dto';
import { Order, PaginatedOrders } from './interfaces/order-response.interface';
import { OrderWithItems } from '@database/interfaces';
import { AppLogger } from '@logger/logger.delegate';
import { ErrorException } from '@errors/types/error-exception';
import { DAT } from '@errors/error-codes';

@Injectable()
export class OrdersService {
  constructor(
    private readonly repo: OrdersRepository,
    private readonly logger: AppLogger,
  ) {}

  async getUserOrders(userId: number, page: number, limit: number): Promise<PaginatedOrders> {
    const offset = (page - 1) * limit;
    const { entries, total } = await this.repo.findIndexByUser(userId, limit, offset);

    if (entries.length === 0) return { orders: [], total: 0, page, limit };

    const hotIds = entries.filter(e => e.tier === 2).map(e => e.orderId);
    const warmIds = entries.filter(e => e.tier === 3).map(e => e.orderId);
    const coldEntries = entries.filter(e => e.tier === 4);

    const [hot, warm, cold] = await Promise.all([
      this.repo.findHotOrders(hotIds),
      this.repo.findWarmOrders(warmIds),
      this.repo.findColdOrders(coldEntries),
    ]);

    this.logger.logEvent('orders.user.fetched', {
      attributes: { userId, hot: hot.length, warm: warm.length, cold: cold.length },
    });

    const allOrders = [...hot, ...warm, ...cold].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    return { orders: allOrders.map(this.toResponse), total, page, limit };
  }

  async getOrderById(orderId: bigint): Promise<Order> {
    const order = await this.repo.findOrderById(orderId);
    if (!order) throw new ErrorException(DAT.NOT_FOUND, { message: `Order ${orderId} not found` });
    return this.toResponse(order);
  }

  async createOrder(userId: number, dto: CreateOrderDto): Promise<{ orderId: string }> {
    const { orderId } = await this.repo.createOrder(userId, dto);
    this.logger.logEvent('order.created', { attributes: { userId, orderId: orderId.toString() } });
    return { orderId: orderId.toString() };
  }

  private toResponse(o: OrderWithItems): Order {
    return {
      orderId: o.order_id.toString(),
      userId: o.user_id.toString(),
      orderNumber: o.order_number,
      totalAmount: o.total_amount,
      status: o.status,
      shippingAddress: o.shipping_address as Record<string, unknown>,
      paymentMethod: o.payment_method,
      paymentLast4: o.payment_last4 ?? undefined,
      couponCode: o.coupon_code ?? undefined,
      createdAt: o.created_at,
      tier: o.tier,
      tierName: o.tierName,
      archiveLocation: o.archive_location,
      items: o.items?.map(i => ({
        itemId: i.item_id.toString(),
        productId: i.product_id.toString(),
        productName: i.product_name,
        quantity: i.quantity,
        unitPrice: i.unit_price,
        discountAmount: i.discount_amount,
        taxAmount: i.tax_amount,
      })),
    };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/orders/orders.service.ts
git commit -m "feat(orders): add OrdersService with parallel multi-tier query routing"
```

### Task 1C.4: OrdersController and OrdersModule

**Files:**

- Create: `src/modules/orders/orders.controller.ts`
- Create: `src/modules/orders/orders.module.ts`

- [ ] **Step 1: Write OrdersController**

Create `src/modules/orders/orders.controller.ts`:

```typescript
import { Controller, Get, Post, Param, Query, Body, ParseIntPipe, Version } from '@nestjs/common';
import { ApiTags, ApiSecurity } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { createOrderSchema } from './dto/create-order.dto';
import { queryOrdersSchema } from './dto/query-orders.dto';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';
import { ApiEndpoint } from '@common/decorators/api-endpoint.decorator';

@ApiTags('orders')
@ApiSecurity('x-user-id')
@Controller({ path: 'orders', version: '1' })
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('user/:userId')
  @ApiEndpoint({ summary: 'Get paginated orders for a user across all storage tiers' })
  async getUserOrders(
    @Param('userId', ParseIntPipe) userId: number,
    @Query(new ZodValidationPipe(queryOrdersSchema)) query: { page: number; limit: number },
  ) {
    return this.ordersService.getUserOrders(userId, query.page, query.limit);
  }

  @Get(':orderId')
  @ApiEndpoint({ summary: 'Get a single order by ID (routes to correct storage tier)' })
  async getOrder(@Param('orderId') orderId: string) {
    return this.ordersService.getOrderById(BigInt(orderId));
  }

  @Post()
  @ApiEndpoint({ summary: 'Create a new order (writes to primary DB only)' })
  async createOrder(
    @Body(new ZodValidationPipe(createOrderSchema)) dto: any,
    @Query('userId', ParseIntPipe) userId: number,
  ) {
    return this.ordersService.createOrder(userId, dto);
  }
}
```

- [ ] **Step 2: Write OrdersModule**

Create `src/modules/orders/orders.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersRepository } from './orders.repository';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository],
  exports: [OrdersService],
})
export class OrdersModule {}
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/orders/orders.controller.ts src/modules/orders/orders.module.ts
git commit -m "feat(orders): add OrdersController and OrdersModule"
```

---

## Phase 1D — Archival + MockData Track (worktree: `feat/om-archival`)

> Spawn worktree: `git worktree add ../om-archival feat/om-archival`

### Task 1D.1: ArchivalService and PartitionRotationService

**Files:**

- Create: `src/modules/archival/archival.service.ts`
- Create: `src/modules/archival/partition-rotation.service.ts`

- [ ] **Step 1: Write ArchivalService**

Create `src/modules/archival/archival.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { MultiDbService } from '@database/multi-db.service';
import { ArchiveRegistryService } from '@database/archive-registry.service';
import { AppLogger } from '@logger/logger.delegate';

interface DbSizeRow {
  size_bytes: string;
  size_mb: string;
  order_count: string;
}

@Injectable()
export class ArchivalService {
  constructor(
    private readonly db: MultiDbService,
    private readonly registry: ArchiveRegistryService,
    private readonly logger: AppLogger,
  ) {}

  async getDatabaseSizes(): Promise<Record<string, unknown>> {
    const primary = await this.db.getPrimaryPool().query<DbSizeRow>(
      `SELECT pg_database_size(current_database())::text AS size_bytes,
              round(pg_database_size(current_database()) / 1048576.0, 2)::text AS size_mb,
              (SELECT COUNT(*)::text FROM orders_recent) AS order_count`,
    );

    const metadata = await this.db.getMetadataPool().query<DbSizeRow>(
      `SELECT pg_database_size(current_database())::text AS size_bytes,
              round(pg_database_size(current_database()) / 1048576.0, 2)::text AS size_mb,
              (SELECT COUNT(*)::text FROM order_metadata_archive) AS order_count`,
    );

    const archives: Record<string, unknown>[] = [];
    for (const [year, configs] of this.registry.getAllArchives()) {
      for (const cfg of configs) {
        if (cfg.tier !== 4) continue;
        const pool = this.registry.getPoolForArchive(cfg);
        const result = await pool.query<DbSizeRow>(
          `SELECT pg_database_size(current_database())::text AS size_bytes,
                  round(pg_database_size(current_database()) / 1048576.0, 2)::text AS size_mb,
                  (SELECT COUNT(*)::text FROM archived_orders) AS order_count`,
        );
        archives.push({
          name: cfg.databaseName,
          year,
          sizeMb: result.rows[0].size_mb,
          orderCount: result.rows[0].order_count,
          tier: 4,
        });
      }
    }

    return {
      primary: {
        sizeMb: primary.rows[0].size_mb,
        orderCount: primary.rows[0].order_count,
        tier: 2,
        tierName: 'hot',
      },
      metadataArchive: {
        sizeMb: metadata.rows[0].size_mb,
        orderCount: metadata.rows[0].order_count,
        tier: 3,
        tierName: 'warm',
      },
      coldArchives: archives,
    };
  }

  async getStats(): Promise<Record<string, unknown>> {
    const pool = this.db.getReadPool();
    const [hotCount, indexDist] = await Promise.all([
      pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM orders_recent'),
      pool.query<{ tier: number; count: string }>(
        'SELECT tier, COUNT(*) AS count FROM user_order_index GROUP BY tier ORDER BY tier',
      ),
    ]);

    return {
      hotOrders: parseInt(hotCount.rows[0].count, 10),
      tierDistribution: indexDist.rows.map(r => ({
        tier: r.tier,
        tierName: r.tier === 2 ? 'hot' : r.tier === 3 ? 'warm' : 'cold',
        count: parseInt(r.count, 10),
      })),
    };
  }

  async getArchiveForYear(year: number): Promise<Record<string, unknown>> {
    const cfg = this.registry.getArchiveForYear(year, 4);
    if (!cfg) return { error: `No cold archive found for year ${year}` };
    return {
      databaseName: cfg.databaseName,
      host: cfg.host,
      port: cfg.port,
      tier: cfg.tier,
    };
  }
}
```

- [ ] **Step 2: Write PartitionRotationService**

Create `src/modules/archival/partition-rotation.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { MultiDbService } from '@database/multi-db.service';
import { AppLogger } from '@logger/logger.delegate';

@Injectable()
export class PartitionRotationService {
  constructor(
    private readonly db: MultiDbService,
    private readonly logger: AppLogger,
  ) {}

  async simulateRotation(batchSize = 1000): Promise<Record<string, unknown>> {
    const primaryPool = this.db.getPrimaryPool();
    const metadataPool = this.db.getMetadataPool();

    // Fetch oldest hot orders beyond 90 days
    const candidatesRes = await primaryPool.query<{
      order_id: bigint;
      user_id: bigint;
      order_number: string;
      total_amount: string;
      status: string;
      payment_method: string;
      created_at: Date;
    }>(
      `SELECT order_id, user_id, order_number, total_amount, status, payment_method, created_at
       FROM orders_recent
       WHERE created_at < NOW() - INTERVAL '90 days'
       ORDER BY created_at ASC
       LIMIT $1`,
      [batchSize],
    );

    if (candidatesRes.rows.length === 0) {
      return { message: 'No orders eligible for rotation (all within 90 days)', recordsMoved: 0 };
    }

    const orderIds = candidatesRes.rows.map(r => r.order_id);

    const primaryClient = await primaryPool.connect();
    const metadataClient = await metadataPool.connect();

    try {
      await primaryClient.query('BEGIN');
      await metadataClient.query('BEGIN');

      // Insert into metadata archive
      await metadataClient.query(
        `INSERT INTO order_metadata_archive
           (order_id, user_id, order_number, total_amount, status, payment_method, created_at, archive_location)
         SELECT order_id, user_id, order_number, total_amount, status, payment_method, created_at, 'metadata_archive_db'
         FROM unnest($1::bigint[], $2::bigint[], $3::text[], $4::numeric[], $5::text[], $6::text[], $7::timestamp[])
           AS t(order_id, user_id, order_number, total_amount, status, payment_method, created_at)
         ON CONFLICT (order_id) DO NOTHING`,
        [
          candidatesRes.rows.map(r => r.order_id),
          candidatesRes.rows.map(r => r.user_id),
          candidatesRes.rows.map(r => r.order_number),
          candidatesRes.rows.map(r => r.total_amount),
          candidatesRes.rows.map(r => r.status),
          candidatesRes.rows.map(r => r.payment_method),
          candidatesRes.rows.map(r => r.created_at),
        ],
      );

      // Update user_order_index tier
      await primaryClient.query(
        `UPDATE user_order_index SET tier = 3, archive_location = 'metadata_archive_db'
         WHERE order_id = ANY($1)`,
        [orderIds],
      );

      // Delete from hot table + items (CASCADE handles items)
      await primaryClient.query('DELETE FROM orders_recent WHERE order_id = ANY($1)', [orderIds]);

      // Record in partition_simulation
      await primaryClient.query(
        `INSERT INTO partition_simulation (partition_date, is_rotated, rotated_at, records_moved)
         VALUES (CURRENT_DATE, true, NOW(), $1)`,
        [candidatesRes.rows.length],
      );

      await primaryClient.query('COMMIT');
      await metadataClient.query('COMMIT');

      this.logger.logEvent('partition.rotated', {
        attributes: { recordsMoved: candidatesRes.rows.length },
      });

      return {
        message: `Rotated ${candidatesRes.rows.length} orders from hot → warm tier`,
        movedFrom: 'orders_recent',
        movedTo: 'order_metadata_archive',
        recordsMoved: candidatesRes.rows.length,
      };
    } catch (err) {
      await primaryClient.query('ROLLBACK');
      await metadataClient.query('ROLLBACK');
      throw err;
    } finally {
      primaryClient.release();
      metadataClient.release();
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/archival/archival.service.ts src/modules/archival/partition-rotation.service.ts
git commit -m "feat(archival): add ArchivalService and PartitionRotationService"
```

### Task 1D.2: ArchivalController and ArchivalModule

**Files:**

- Create: `src/modules/archival/archival.controller.ts`
- Create: `src/modules/archival/archival.module.ts`

- [ ] **Step 1: Write controller**

Create `src/modules/archival/archival.controller.ts`:

```typescript
import { Controller, Get, Post, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiSecurity } from '@nestjs/swagger';
import { ArchivalService } from './archival.service';
import { PartitionRotationService } from './partition-rotation.service';
import { Public } from '@common/decorators/public.decorator';
import { ApiEndpoint } from '@common/decorators/api-endpoint.decorator';

@ApiTags('archival')
@ApiSecurity('x-user-id')
@Controller({ path: 'admin/archival', version: '1' })
export class ArchivalController {
  constructor(
    private readonly archivalService: ArchivalService,
    private readonly rotationService: PartitionRotationService,
  ) {}

  @Post('simulate-rotation')
  @Public()
  @ApiEndpoint({ summary: 'Simulate partition rotation: move oldest hot orders → warm tier' })
  simulateRotation() {
    return this.rotationService.simulateRotation();
  }

  @Get('stats')
  @Public()
  @ApiEndpoint({ summary: 'Get row counts per storage tier' })
  getStats() {
    return this.archivalService.getStats();
  }

  @Get('database-sizes')
  @Public()
  @ApiEndpoint({ summary: 'Get pg_database_size() for all DB instances' })
  getDatabaseSizes() {
    return this.archivalService.getDatabaseSizes();
  }

  @Get('archive-for-year/:year')
  @Public()
  @ApiEndpoint({ summary: 'Look up cold archive config for a given year' })
  getArchiveForYear(@Param('year', ParseIntPipe) year: number) {
    return this.archivalService.getArchiveForYear(year);
  }
}
```

- [ ] **Step 2: Write module**

Create `src/modules/archival/archival.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ArchivalController } from './archival.controller';
import { ArchivalService } from './archival.service';
import { PartitionRotationService } from './partition-rotation.service';

@Module({
  controllers: [ArchivalController],
  providers: [ArchivalService, PartitionRotationService],
})
export class ArchivalModule {}
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/archival/
git commit -m "feat(archival): add ArchivalController and ArchivalModule"
```

### Task 1D.3: MockDataModule

**Files:**

- Create: `src/modules/mock-data/mock-data.service.ts`
- Create: `src/modules/mock-data/mock-data.controller.ts`
- Create: `src/modules/mock-data/mock-data.module.ts`

- [ ] **Step 1: Write MockDataService**

Create `src/modules/mock-data/mock-data.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { MultiDbService } from '@database/multi-db.service';
import { ArchiveRegistryService } from '@database/archive-registry.service';
import { AppLogger } from '@logger/logger.delegate';

@Injectable()
export class MockDataService {
  constructor(
    private readonly db: MultiDbService,
    private readonly registry: ArchiveRegistryService,
    private readonly logger: AppLogger,
  ) {}

  async getStatus(): Promise<Record<string, unknown>> {
    const pool = this.db.getReadPool();
    const [hot, index] = await Promise.all([
      pool.query<{ count: string; min_date: Date; max_date: Date }>(
        'SELECT COUNT(*) AS count, MIN(created_at) AS min_date, MAX(created_at) AS max_date FROM orders_recent',
      ),
      pool.query<{ tier: number; count: string }>(
        'SELECT tier, COUNT(*) AS count FROM user_order_index GROUP BY tier ORDER BY tier',
      ),
    ]);

    const metaPool = this.db.getMetadataPool();
    const warm = await metaPool.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM order_metadata_archive',
    );

    const coldStats: Record<string, number> = {};
    for (const [year, configs] of this.registry.getAllArchives()) {
      for (const cfg of configs) {
        if (cfg.tier !== 4) continue;
        const p = this.registry.getPoolForArchive(cfg);
        const r = await p.query<{ count: string }>('SELECT COUNT(*) AS count FROM archived_orders');
        coldStats[cfg.databaseName] = parseInt(r.rows[0].count, 10);
      }
    }

    return {
      hot: {
        orderCount: parseInt(hot.rows[0].count, 10),
        oldestOrder: hot.rows[0].min_date,
        newestOrder: hot.rows[0].max_date,
      },
      warm: { orderCount: parseInt(warm.rows[0].count, 10) },
      cold: coldStats,
      indexDistribution: index.rows.map(r => ({
        tier: r.tier,
        tierName: r.tier === 2 ? 'hot' : r.tier === 3 ? 'warm' : 'cold',
        count: parseInt(r.count, 10),
      })),
    };
  }

  async generateIfEmpty(): Promise<Record<string, unknown>> {
    const pool = this.db.getPrimaryPool();
    const result = await pool.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM orders_recent',
    );
    const count = parseInt(result.rows[0].count, 10);

    if (count > 0) {
      return { message: 'Data already present — skipping generation', existingHotOrders: count };
    }

    this.logger.logEvent('mock-data.generation.started');

    // The generate_series SQL runs at DB init time via init-scripts.
    // This endpoint is for re-seeding if volumes are cleared.
    // For now, report status and instruct to restart containers.
    return {
      message:
        'Hot orders table is empty. Data is seeded via init-scripts at container start. Run: podman-compose down -v && podman-compose up -d',
      tip: 'The generate_series SQL in init-scripts/ seeds all tiers automatically on first startup.',
    };
  }
}
```

- [ ] **Step 2: Write controller and module**

Create `src/modules/mock-data/mock-data.controller.ts`:

```typescript
import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MockDataService } from './mock-data.service';
import { Public } from '@common/decorators/public.decorator';
import { ApiEndpoint } from '@common/decorators/api-endpoint.decorator';

@ApiTags('mock-data')
@Controller({ path: 'mock-data', version: '1' })
export class MockDataController {
  constructor(private readonly mockDataService: MockDataService) {}

  @Get('status')
  @Public()
  @ApiEndpoint({ summary: 'Get data status across all storage tiers' })
  getStatus() {
    return this.mockDataService.getStatus();
  }

  @Post('generate')
  @Public()
  @ApiEndpoint({ summary: 'Trigger data generation if tables are empty' })
  generate() {
    return this.mockDataService.generateIfEmpty();
  }
}
```

Create `src/modules/mock-data/mock-data.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { MockDataController } from './mock-data.controller';
import { MockDataService } from './mock-data.service';

@Module({
  controllers: [MockDataController],
  providers: [MockDataService],
})
export class MockDataModule {}
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/mock-data/
git commit -m "feat(mock-data): add MockDataModule with status endpoint"
```

---

## Phase 1E — Docs + k6 Track (worktree: `feat/om-docs`)

> Spawn worktree: `git worktree add ../om-docs feat/om-docs`

### Task 1E.1: k6 load test scripts

**Files:**

- Create: `test/k6/read-orders.js`
- Create: `test/k6/create-orders.js`
- Create: `test/k6/archival-stats.js`

- [ ] **Step 1: Write read-orders k6 script**

Create `test/k6/read-orders.js`:

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const p95Trend = new Trend('p95_latency');

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '2m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<200', 'p(99)<500'],
    errors: ['rate<0.01'],
  },
};

const BASE = 'http://localhost:3000/api/v1';

export default function () {
  const userId = Math.floor(Math.random() * 10000) + 1;
  const page = Math.floor(Math.random() * 5) + 1;

  const res = http.get(`${BASE}/orders/user/${userId}?page=${page}&limit=20`, {
    headers: { 'x-user-id': String(userId) },
  });

  const ok = check(res, {
    'status 200': r => r.status === 200,
    'has orders array': r => JSON.parse(r.body).data?.orders !== undefined,
    'latency < 200ms': r => r.timings.duration < 200,
  });

  errorRate.add(!ok);
  p95Trend.add(res.timings.duration);
  sleep(0.5);
}
```

- [ ] **Step 2: Write create-orders k6 script**

Create `test/k6/create-orders.js`:

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '15s', target: 10 },
    { duration: '90s', target: 20 },
    { duration: '15s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<300'],
    errors: ['rate<0.02'],
  },
};

const BASE = 'http://localhost:3000/api/v1';

const CITIES = [
  { city: 'Mumbai', state: 'MH' },
  { city: 'Delhi', state: 'DL' },
  { city: 'Bengaluru', state: 'KA' },
];

export default function () {
  const userId = Math.floor(Math.random() * 10000) + 1;
  const city = CITIES[Math.floor(Math.random() * CITIES.length)];
  const prodId = Math.floor(Math.random() * 30) + 1;

  const payload = JSON.stringify({
    items: [{ productId: prodId, quantity: Math.floor(Math.random() * 3) + 1 }],
    shippingAddress: {
      name: `Customer ${userId}`,
      line1: `${userId} Main St`,
      city: city.city,
      state: city.state,
      pincode: '400001',
      country: 'IN',
    },
    paymentMethod: ['credit_card', 'upi', 'cod', 'wallet'][userId % 4],
  });

  const res = http.post(`${BASE}/orders?userId=${userId}`, payload, {
    headers: { 'Content-Type': 'application/json', 'x-user-id': String(userId) },
  });

  const ok = check(res, {
    'status 201': r => r.status === 201,
    'has orderId': r => JSON.parse(r.body).data?.orderId !== undefined,
    'latency < 300ms': r => r.timings.duration < 300,
  });

  errorRate.add(!ok);
  sleep(1);
}
```

- [ ] **Step 3: Write archival-stats k6 script**

Create `test/k6/archival-stats.js`:

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '15s', target: 5 },
    { duration: '45s', target: 5 },
    { duration: '15s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'],
  },
};

const BASE = 'http://localhost:3000/api/v1';

export default function () {
  const endpoints = [
    `${BASE}/admin/archival/stats`,
    `${BASE}/admin/archival/database-sizes`,
    `${BASE}/admin/archival/archive-for-year/2023`,
    `${BASE}/mock-data/status`,
  ];

  const url = endpoints[Math.floor(Math.random() * endpoints.length)];
  const res = http.get(url);

  check(res, {
    'status 200': r => r.status === 200,
    'latency < 1s': r => r.timings.duration < 1000,
  });

  sleep(2);
}
```

- [ ] **Step 4: Commit k6 scripts**

```bash
git add test/k6/
git commit -m "feat(k6): add 3-scenario load tests (read, write, archival-stats)"
```

### Task 1E.2: Update CLAUDE.md

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Update project overview section in CLAUDE.md**

Find the top of `CLAUDE.md` and replace the project overview block:

```markdown
# CLAUDE.md — AI Router for large-order-management backend

## Project Overview

Multi-tier NestJS 11 backend for the large order management take-home assignment
(see `Question-2.md`).
**Domain:** E-commerce order archival — Hot (last 90 days) / Warm (2024 metadata) /
Cold (2023–2025 dedicated archive DBs) storage tiers with dynamic routing.
**Auth:** mocked via `x-user-id` header (userId as positive integer).
**Stack:** NestJS 11, Express, raw `pg` pools (no Prisma at runtime), PostgreSQL 16
(primary + 2 read replicas + 5 archive instances), Redis (ioredis), Zod validation,
Pino + nestjs-cls for request-scoped context, OpenTelemetry (enabled in Docker).
**Container runtime:** Podman + podman-compose (Docker Compose YAML compatible).
Run with: `podman-compose up -d`
```

Also update the Folder Map to reflect the new `src/modules/` structure:

```markdown
├── modules/
│ ├── orders/ # /api/v1/orders — multi-tier order CRUD
│ ├── archival/ # /api/v1/admin/archival — stats, DB sizes, rotation
│ └── mock-data/ # /api/v1/mock-data — data status endpoint
```

And add to the NestJS DI Rules section:

```markdown
**Container runtime note:** This project uses Podman instead of Docker.
Commands: `podman-compose up -d`, `podman-compose down -v`, `podman ps`.
Docker Compose YAML syntax is fully compatible — no changes needed to docker-compose.yml.
```

- [ ] **Step 2: Commit CLAUDE.md**

```bash
git add CLAUDE.md
git commit -m "docs(claude): update for order management domain and Podman runtime"
```

---

## Phase 2 — Integration (run on `feat/order-management`)

### Task 2.1: Merge all tracks in order

- [ ] **Step 1: Delete old Twitter module directories**

```bash
rm -rf src/modules/departments src/modules/tweets src/database/companies \
       src/database/departments src/database/tweets src/database/users \
       src/database/extensions src/database/base.repository.ts src/database/types.ts \
       prisma/seed.ts
```

- [ ] **Step 2: Merge tracks in dependency order**

```bash
# Merge infra first (no code deps)
git merge feat/om-infra --no-ff -m "merge(infra): docker-compose, init-scripts, replication"

# Merge database layer (no module deps)
git merge feat/om-database --no-ff -m "merge(database): MultiDbService, ArchiveRegistryService"

# Merge orders (depends on database interfaces)
git merge feat/om-orders --no-ff -m "merge(orders): OrdersModule with multi-tier routing"

# Merge archival + mock-data (depends on database)
git merge feat/om-archival --no-ff -m "merge(archival): ArchivalModule, MockDataModule"

# Merge docs + k6 (independent)
git merge feat/om-docs --no-ff -m "merge(docs): k6 scripts, CLAUDE.md update"
```

- [ ] **Step 3: Run TypeScript compile check**

```bash
npx tsc --noEmit
```

Expected: 0 errors. Fix any import path issues from merge.

- [ ] **Step 4: Smoke test — start primary DB only**

```bash
podman-compose up primary-db redis -d
sleep 10
npx prisma migrate deploy --schema=src/database/prisma/schema.prisma
npm run start:dev &
sleep 5
curl -s http://localhost:3000/api/v1/mock-data/status | jq .
```

Expected: JSON response with tier distribution counts.

- [ ] **Step 5: Smoke test — full stack**

```bash
podman-compose down
podman-compose up -d
sleep 60  # wait for seed scripts to complete
curl -s http://localhost:3000/api/v1/admin/archival/stats | jq .
curl -s http://localhost:3000/api/v1/orders/user/1?page=1 -H 'x-user-id: 1' | jq .
curl -s http://localhost:3000/api/v1/admin/archival/database-sizes | jq .
```

Expected: stats showing ~200K hot, ~1M warm, ~1.8M cold orders. User 1 orders returned from correct tiers.

- [ ] **Step 6: Run k6 read test**

```bash
k6 run test/k6/read-orders.js
```

Expected: p95 < 200ms, error rate < 1%.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat(integration): merge all order management tracks, smoke tested"
```

---

## Worktree Spawn Commands (run from `feat/order-management`)

```bash
# Create all 5 worktrees in parallel-ready state
git worktree add ../om-infra    -b feat/om-infra    feat/order-management
git worktree add ../om-database -b feat/om-database feat/order-management
git worktree add ../om-orders   -b feat/om-orders   feat/order-management
git worktree add ../om-archival -b feat/om-archival feat/order-management
git worktree add ../om-docs     -b feat/om-docs     feat/order-management
```

Each worktree directory is a sibling of the main repo. Subagents should `cd` into their worktree before working.

---

## Error Code Additions Needed

Add to `src/errors/error-codes/database.errors.ts`:

```typescript
NOT_FOUND: {
  code: 'DAT0011',
  message: 'Resource not found',
  httpStatus: 404,
  userFacing: true,
},
ORDER_NOT_FOUND: {
  code: 'DAT0012',
  message: 'Order not found',
  httpStatus: 404,
  userFacing: true,
},
```
