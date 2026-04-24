# E-commerce Multi-Archive System - Implementation Guide for Claude Code Agent

## 🎯 Project Overview

Build a **production-grade e-commerce order archival system** in NestJS with Docker that demonstrates:

1. Multi-tier data architecture (Hot/Warm/Cold storage)
2. Dynamic multi-archive database routing
3. Auto-rotating partitions to manage database growth
4. User order index for fast lookups
5. Mock data generation to demonstrate scale

**Size Constraint:** Complete Docker setup under 500MB

---

## 📋 Technical Requirements

### Stack

- **Framework:** NestJS (TypeScript)
- **Databases:**
  - PostgreSQL (Primary Hot DB)
  - PostgreSQL (Metadata Archive)
  - PostgreSQL (3x Cold Archive instances for 2023, 2024, 2025)
- **Cache:** Redis
- **Containerization:** Docker + Docker Compose
- **Mock Data:** Generate realistic test data

### Architecture Layers

```
┌─────────────────────────────────────────┐
│           NestJS Application            │
├─────────────────────────────────────────┤
│ Controllers → Services → Repositories   │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│          Data Layer (5 DBs)             │
├──────────┬──────────┬───────────────────┤
│ Primary  │ Metadata │ Archives (3x)     │
│ (Hot)    │ Archive  │ 2023, 2024, 2025  │
└──────────┴──────────┴───────────────────┘
```

---

## 🗄️ Database Schema Design

### PRIMARY DATABASE (primary_db)

```sql
-- Hot orders (last 90 days) - auto-rotated
CREATE TABLE orders_recent (
    order_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_orders_user_created ON orders_recent(user_id, created_at DESC);
CREATE INDEX idx_orders_created ON orders_recent(created_at DESC);

-- Recent order items
CREATE TABLE order_items_recent (
    item_id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders_recent(order_id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    quantity INT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_items_order ON order_items_recent(order_id);
CREATE INDEX idx_items_product ON order_items_recent(product_id);

-- User order index (THE KEY TABLE for fast lookups)
CREATE TABLE user_order_index (
    user_id BIGINT NOT NULL,
    order_id BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL,
    tier SMALLINT NOT NULL, -- 2=hot, 3=warm, 4=cold
    archive_location VARCHAR(100), -- DB name where full data is
    PRIMARY KEY (user_id, created_at DESC, order_id)
);
CREATE INDEX idx_uoi_order_id ON user_order_index(order_id);
CREATE INDEX idx_uoi_created ON user_order_index(created_at DESC);

-- Archive database registry (maps dates → database instances)
CREATE TABLE archive_databases (
    id SERIAL PRIMARY KEY,
    archive_year INT NOT NULL,
    archive_month INT,
    database_name VARCHAR(100) NOT NULL,
    host VARCHAR(255) NOT NULL,
    port INT NOT NULL DEFAULT 5432,
    tier SMALLINT NOT NULL, -- 3=metadata, 4=cold
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_archive_year ON archive_databases(archive_year);
CREATE INDEX idx_archive_tier ON archive_databases(tier);

-- Products
CREATE TABLE products (
    product_id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    category VARCHAR(100),
    total_orders_count INT DEFAULT 0,
    recent_orders_count INT DEFAULT 0
);

-- Simulation control
CREATE TABLE partition_simulation (
    id SERIAL PRIMARY KEY,
    partition_date DATE NOT NULL,
    is_rotated BOOLEAN DEFAULT FALSE,
    rotated_at TIMESTAMP
);
```

### METADATA ARCHIVE DATABASE (metadata_archive_db)

```sql
-- Lightweight metadata for old orders (90 days - 5 years)
CREATE TABLE order_metadata_archive (
    order_id BIGINT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    order_number VARCHAR(50) NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    archive_location VARCHAR(100) NOT NULL,
    archived_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_meta_user_created ON order_metadata_archive(user_id, created_at DESC);
CREATE INDEX idx_meta_created ON order_metadata_archive(created_at DESC);
CREATE INDEX idx_meta_archive_loc ON order_metadata_archive(archive_location);
```

### COLD ARCHIVE DATABASES (archive_2023, archive_2024, archive_2025)

Each archive database has identical schema:

```sql
-- Full archived orders
CREATE TABLE archived_orders (
    order_id BIGINT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    order_number VARCHAR(50) NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    archived_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_arch_user ON archived_orders(user_id);
CREATE INDEX idx_arch_created ON archived_orders(created_at);

-- Archived order items
CREATE TABLE archived_order_items (
    item_id BIGINT PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES archived_orders(order_id),
    product_id BIGINT NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    quantity INT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP NOT NULL
);
CREATE INDEX idx_arch_items_order ON archived_order_items(order_id);
CREATE INDEX idx_arch_items_product ON archived_order_items(product_id);
```

---

## 🐳 Docker Compose Configuration

```yaml
version: '3.8'

services:
  # Primary Database (Hot Storage)
  primary-db:
    image: postgres:15-alpine
    container_name: ecom-primary-db
    environment:
      POSTGRES_DB: primary_db
      POSTGRES_USER: ecom_user
      POSTGRES_PASSWORD: ecom_pass
    ports:
      - '5432:5432'
    volumes:
      - primary-data:/var/lib/postgresql/data
      - ./init-scripts/primary-init.sql:/docker-entrypoint-initdb.d/init.sql
    networks:
      - ecom-network

  # Metadata Archive Database
  metadata-archive-db:
    image: postgres:15-alpine
    container_name: ecom-metadata-archive
    environment:
      POSTGRES_DB: metadata_archive_db
      POSTGRES_USER: ecom_user
      POSTGRES_PASSWORD: ecom_pass
    ports:
      - '5433:5432'
    volumes:
      - metadata-data:/var/lib/postgresql/data
      - ./init-scripts/metadata-init.sql:/docker-entrypoint-initdb.d/init.sql
    networks:
      - ecom-network

  # Cold Archive 2023
  archive-2023:
    image: postgres:15-alpine
    container_name: ecom-archive-2023
    environment:
      POSTGRES_DB: archive_2023
      POSTGRES_USER: ecom_user
      POSTGRES_PASSWORD: ecom_pass
    ports:
      - '5434:5432'
    volumes:
      - archive-2023-data:/var/lib/postgresql/data
      - ./init-scripts/archive-init.sql:/docker-entrypoint-initdb.d/init.sql
    networks:
      - ecom-network

  # Cold Archive 2024
  archive-2024:
    image: postgres:15-alpine
    container_name: ecom-archive-2024
    environment:
      POSTGRES_DB: archive_2024
      POSTGRES_USER: ecom_user
      POSTGRES_PASSWORD: ecom_pass
    ports:
      - '5435:5432'
    volumes:
      - archive-2024-data:/var/lib/postgresql/data
      - ./init-scripts/archive-init.sql:/docker-entrypoint-initdb.d/init.sql
    networks:
      - ecom-network

  # Cold Archive 2025
  archive-2025:
    image: postgres:15-alpine
    container_name: ecom-archive-2025
    environment:
      POSTGRES_DB: archive_2025
      POSTGRES_USER: ecom_user
      POSTGRES_PASSWORD: ecom_pass
    ports:
      - '5436:5432'
    volumes:
      - archive-2025-data:/var/lib/postgresql/data
      - ./init-scripts/archive-init.sql:/docker-entrypoint-initdb.d/init.sql
    networks:
      - ecom-network

  # Redis Cache
  redis:
    image: redis:7-alpine
    container_name: ecom-redis
    ports:
      - '6379:6379'
    networks:
      - ecom-network

  # NestJS Application
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: ecom-app
    ports:
      - '3000:3000'
    environment:
      NODE_ENV: development
      # Primary DB
      DB_PRIMARY_HOST: primary-db
      DB_PRIMARY_PORT: 5432
      DB_PRIMARY_NAME: primary_db
      DB_PRIMARY_USER: ecom_user
      DB_PRIMARY_PASSWORD: ecom_pass
      # Metadata Archive
      DB_METADATA_HOST: metadata-archive-db
      DB_METADATA_PORT: 5432
      DB_METADATA_NAME: metadata_archive_db
      DB_METADATA_USER: ecom_user
      DB_METADATA_PASSWORD: ecom_pass
      # Redis
      REDIS_HOST: redis
      REDIS_PORT: 6379
    depends_on:
      - primary-db
      - metadata-archive-db
      - archive-2023
      - archive-2024
      - archive-2025
      - redis
    networks:
      - ecom-network
    volumes:
      - ./src:/app/src
      - ./package.json:/app/package.json

networks:
  ecom-network:
    driver: bridge

volumes:
  primary-data:
  metadata-data:
  archive-2023-data:
  archive-2024-data:
  archive-2025-data:
```

---

## 🔄 Read Replica Architecture (Primary + 2 Replicas)

### Why Read Replicas?

With millions of order reads per day, a single PostgreSQL instance becomes a bottleneck.
Adding 2 read replicas with round-robin routing triples read throughput.

### Setup

- **Primary DB** (port 5432): All writes (INSERT/UPDATE/DELETE) + strong-consistency reads
- **Replica 1** (port 5433): Read-only — streams WAL from primary via pg_basebackup
- **Replica 2** (port 5434): Read-only — independent stream from primary

### Postgres Streaming Replication Configuration

Primary `postgresql.conf`:

```conf
wal_level = replica
max_wal_senders = 5
wal_keep_size = 256MB
hot_standby = on
```

Each replica connects via pg_basebackup then runs in hot-standby mode.

### Application-Level Routing (MultiDbService)

```
Write  → getPrimaryPool()       (always primary)
Read   → getReadPool()          (round-robin: replica-1 or replica-2)
Warm   → getMetadataPool()      (metadata-archive-db)
Cold   → getArchivePool(year)   (archive-2023/2024/2025)
```

### Round-Robin Implementation

```typescript
getReadPool(): Pool {
  const idx = this.replicaCounter % this.replicaPools.length;
  this.replicaCounter = (this.replicaCounter + 1) % this.replicaPools.length;
  return this.replicaPools[idx];
}
```

### Demonstration

```bash
# Watch replica lag (should be near-zero)
podman exec ecom-replica-1 psql -U ecom_user primary_db \
  -c "SELECT now() - pg_last_xact_replay_timestamp() AS replication_lag;"

# Run k6 read test — OTel traces show which replica served each request
k6 run test/k6/read-orders.js
```

---

## 📊 Dataset Scale (~3M Orders, ~850MB)

| Tier               | DB                  | Orders  | Items     | Est. Size   |
| ------------------ | ------------------- | ------- | --------- | ----------- |
| Hot (last 90 days) | primary-db          | 200K    | 600K      | ~180 MB     |
| Warm (2024)        | metadata-archive-db | 1M      | —         | ~150 MB     |
| Cold 2023          | archive-2023        | 700K    | 1.4M      | ~200 MB     |
| Cold 2024          | archive-2024        | 650K    | 1.3M      | ~185 MB     |
| Cold 2025          | archive-2025        | 450K    | 900K      | ~135 MB     |
| **Total**          |                     | **~3M** | **~4.2M** | **~850 MB** |

All seeded via Postgres `generate_series` SQL — no app-level loop.
Seeding runs automatically at container first-start.

---

## 📁 Project Structure

```
ecommerce-archive-system/
├── docker-compose.yml
├── Dockerfile
├── package.json
├── tsconfig.json
├── nest-cli.json
├── .env.example
├── init-scripts/
│   ├── primary-init.sql
│   ├── metadata-init.sql
│   └── archive-init.sql
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── config/
│   │   └── database.config.ts
│   ├── database/
│   │   ├── database.module.ts
│   │   ├── database.service.ts
│   │   └── archive-registry.service.ts
│   ├── orders/
│   │   ├── orders.module.ts
│   │   ├── orders.controller.ts
│   │   ├── orders.service.ts
│   │   └── dto/
│   │       ├── create-order.dto.ts
│   │       └── query-orders.dto.ts
│   ├── archival/
│   │   ├── archival.module.ts
│   │   ├── archival.service.ts
│   │   └── partition-rotation.service.ts
│   ├── mock-data/
│   │   ├── mock-data.module.ts
│   │   ├── mock-data.service.ts
│   │   └── data-generator.service.ts
│   └── common/
│       ├── interfaces/
│       ├── enums/
│       └── utils/
└── README.md
```

---

## 🔧 NestJS Implementation Details

### 1. Database Module (database.service.ts)

```typescript
@Injectable()
export class DatabaseService {
  private primaryPool: Pool;
  private metadataPool: Pool;
  private archivePools: Map<string, Pool> = new Map();

  async onModuleInit() {
    // Initialize primary database
    this.primaryPool = new Pool({
      host: process.env.DB_PRIMARY_HOST,
      port: parseInt(process.env.DB_PRIMARY_PORT),
      database: process.env.DB_PRIMARY_NAME,
      user: process.env.DB_PRIMARY_USER,
      password: process.env.DB_PRIMARY_PASSWORD,
      max: 20,
    });

    // Initialize metadata archive
    this.metadataPool = new Pool({
      host: process.env.DB_METADATA_HOST,
      port: parseInt(process.env.DB_METADATA_PORT),
      database: process.env.DB_METADATA_NAME,
      user: process.env.DB_METADATA_USER,
      password: process.env.DB_METADATA_PASSWORD,
      max: 10,
    });
  }

  getPrimaryPool(): Pool {
    return this.primaryPool;
  }

  getMetadataPool(): Pool {
    return this.metadataPool;
  }

  async getArchivePool(dbName: string, host: string, port: number): Promise<Pool> {
    const key = `${host}:${port}:${dbName}`;

    if (this.archivePools.has(key)) {
      return this.archivePools.get(key);
    }

    const pool = new Pool({
      host,
      port,
      database: dbName,
      user: process.env.DB_PRIMARY_USER,
      password: process.env.DB_PRIMARY_PASSWORD,
      max: 5,
    });

    this.archivePools.set(key, pool);
    return pool;
  }
}
```

### 2. Archive Registry Service (archive-registry.service.ts)

```typescript
@Injectable()
export class ArchiveRegistryService {
  private registryCache: Map<string, ArchiveConfig> = new Map();

  constructor(private readonly dbService: DatabaseService) {}

  async getArchiveForDate(date: Date): Promise<ArchiveConfig> {
    const year = date.getFullYear();
    const cacheKey = `${year}`;

    if (this.registryCache.has(cacheKey)) {
      return this.registryCache.get(cacheKey);
    }

    const pool = this.dbService.getPrimaryPool();
    const result = await pool.query(
      `SELECT * FROM archive_databases 
       WHERE archive_year = $1 AND tier = 4 AND is_active = true 
       LIMIT 1`,
      [year],
    );

    if (result.rows.length === 0) {
      throw new Error(`No archive found for year ${year}`);
    }

    const config = result.rows[0];
    this.registryCache.set(cacheKey, config);
    return config;
  }

  async getArchiveConnection(archiveConfig: ArchiveConfig): Promise<Pool> {
    return this.dbService.getArchivePool(
      archiveConfig.database_name,
      archiveConfig.host,
      archiveConfig.port,
    );
  }
}
```

### 3. Orders Service (orders.service.ts)

```typescript
@Injectable()
export class OrdersService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly archiveRegistry: ArchiveRegistryService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async getUserOrders(userId: number, page: number = 1, limit: number = 20) {
    const offset = (page - 1) * limit;

    // Step 1: Query user_order_index (fast - single partition conceptually)
    const pool = this.dbService.getPrimaryPool();
    const indexResult = await pool.query(
      `SELECT order_id, created_at, tier, archive_location
       FROM user_order_index
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );

    if (indexResult.rows.length === 0) {
      return { orders: [], total: 0, page, limit };
    }

    // Step 2: Group by tier
    const ordersByTier = this.groupByTier(indexResult.rows);

    // Step 3: Fetch from each tier in parallel
    const promises = [];

    if (ordersByTier[2]?.length > 0) {
      promises.push(this.fetchFromTier2(ordersByTier[2]));
    }

    if (ordersByTier[3]?.length > 0) {
      promises.push(this.fetchFromTier3(ordersByTier[3]));
    }

    if (ordersByTier[4]?.length > 0) {
      promises.push(this.fetchFromTier4(ordersByTier[4]));
    }

    const results = await Promise.all(promises);
    const orders = results.flat();

    // Get total count
    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM user_order_index WHERE user_id = $1',
      [userId],
    );

    return {
      orders,
      total: parseInt(countResult.rows[0].total),
      page,
      limit,
    };
  }

  private async fetchFromTier2(orderIds: number[]) {
    const pool = this.dbService.getPrimaryPool();
    const result = await pool.query(
      `SELECT o.*, 
              json_agg(
                json_build_object(
                  'item_id', oi.item_id,
                  'product_id', oi.product_id,
                  'product_name', oi.product_name,
                  'quantity', oi.quantity,
                  'price', oi.price
                )
              ) as items
       FROM orders_recent o
       LEFT JOIN order_items_recent oi ON o.order_id = oi.order_id
       WHERE o.order_id = ANY($1)
       GROUP BY o.order_id`,
      [orderIds],
    );

    return result.rows.map(r => ({ ...r, tier: 2, tierName: 'hot' }));
  }

  private async fetchFromTier4(entries: any[]) {
    // Group by archive location
    const byLocation = new Map();
    entries.forEach(e => {
      if (!byLocation.has(e.archive_location)) {
        byLocation.set(e.archive_location, []);
      }
      byLocation.get(e.archive_location).push(e.order_id);
    });

    // Query each archive in parallel
    const promises = Array.from(byLocation.entries()).map(async ([location, orderIds]) => {
      const archiveConfig = await this.getArchiveConfigByName(location);
      const pool = await this.archiveRegistry.getArchiveConnection(archiveConfig);

      const result = await pool.query(
        `SELECT o.*, 
                json_agg(
                  json_build_object(
                    'item_id', oi.item_id,
                    'product_id', oi.product_id,
                    'product_name', oi.product_name,
                    'quantity', oi.quantity,
                    'price', oi.price
                  )
                ) as items
         FROM archived_orders o
         LEFT JOIN archived_order_items oi ON o.order_id = oi.order_id
         WHERE o.order_id = ANY($1)
         GROUP BY o.order_id`,
        [orderIds],
      );

      return result.rows.map(r => ({
        ...r,
        tier: 4,
        tierName: 'cold',
        archive_location: location,
      }));
    });

    const results = await Promise.all(promises);
    return results.flat();
  }
}
```

### 4. Mock Data Generator (data-generator.service.ts)

```typescript
@Injectable()
export class DataGeneratorService {
  private readonly USERS_COUNT = 1000;
  private readonly PRODUCTS_COUNT = 100;

  async generateMockData() {
    await this.generateProducts();
    await this.generateUsers();
    await this.generateOrders();
    await this.simulateArchival();
    await this.registerArchiveDatabases();
  }

  private async generateOrders() {
    // Generate orders across different time periods
    const now = new Date();

    // Hot tier (last 90 days): 5000 orders
    await this.generateOrdersForPeriod(
      new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
      now,
      5000,
      'orders_recent',
      2, // tier 2
    );

    // Warm tier (2024): 10000 orders
    await this.generateOrdersForPeriod(
      new Date('2024-01-01'),
      new Date('2024-12-31'),
      10000,
      'metadata_archive',
      3, // tier 3
    );

    // Cold tier (2023): 15000 orders
    await this.generateOrdersForPeriod(
      new Date('2023-01-01'),
      new Date('2023-12-31'),
      15000,
      'archive_2023',
      4, // tier 4
    );
  }

  private async generateOrdersForPeriod(
    startDate: Date,
    endDate: Date,
    count: number,
    targetTable: string,
    tier: number,
  ) {
    const orders = [];
    const items = [];
    const indexEntries = [];

    for (let i = 0; i < count; i++) {
      const orderId = Date.now() + i;
      const userId = Math.floor(Math.random() * this.USERS_COUNT) + 1;
      const createdAt = this.randomDate(startDate, endDate);

      const order = {
        order_id: orderId,
        user_id: userId,
        order_number: `ORD-${orderId}`,
        total_amount: (Math.random() * 1000).toFixed(2),
        status: this.randomStatus(),
        created_at: createdAt,
      };

      orders.push(order);

      // Generate 1-5 items per order
      const itemCount = Math.floor(Math.random() * 5) + 1;
      for (let j = 0; j < itemCount; j++) {
        items.push({
          order_id: orderId,
          product_id: Math.floor(Math.random() * this.PRODUCTS_COUNT) + 1,
          product_name: `Product ${Math.floor(Math.random() * this.PRODUCTS_COUNT)}`,
          quantity: Math.floor(Math.random() * 5) + 1,
          price: (Math.random() * 200).toFixed(2),
        });
      }

      // User order index entry
      indexEntries.push({
        user_id: userId,
        order_id: orderId,
        created_at: createdAt,
        tier: tier,
        archive_location: tier === 4 ? `archive_${createdAt.getFullYear()}` : null,
      });
    }

    // Bulk insert
    await this.bulkInsertOrders(orders, items, indexEntries, targetTable, tier);
  }
}
```

---

## 🚀 API Endpoints to Implement

### Orders Controller

```typescript
@Controller('orders')
export class OrdersController {
  @Get('user/:userId')
  async getUserOrders(
    @Param('userId') userId: number,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.ordersService.getUserOrders(userId, page, limit);
  }

  @Get(':orderId')
  async getOrder(@Param('orderId') orderId: number) {
    return this.ordersService.getOrderById(orderId);
  }

  @Post()
  async createOrder(@Body() createOrderDto: CreateOrderDto) {
    return this.ordersService.createOrder(createOrderDto);
  }

  @Get('product/:productId/orders')
  async getProductOrders(
    @Param('productId') productId: number,
    @Query('limit') limit: number = 50,
  ) {
    return this.ordersService.getProductOrders(productId, limit);
  }
}
```

### Archival Controller (Admin)

```typescript
@Controller('admin/archival')
export class ArchivalController {
  @Post('simulate-rotation')
  async simulateRotation() {
    return this.partitionRotationService.simulateRotation();
  }

  @Get('stats')
  async getStats() {
    return this.archivalService.getArchivalStats();
  }

  @Get('database-sizes')
  async getDatabaseSizes() {
    return this.archivalService.getDatabaseSizes();
  }
}
```

### Mock Data Controller

```typescript
@Controller('mock-data')
export class MockDataController {
  @Post('generate')
  async generateMockData() {
    return this.dataGeneratorService.generateMockData();
  }

  @Get('status')
  async getDataStatus() {
    return this.dataGeneratorService.getDataStatus();
  }
}
```

---

## 📊 Mock Data Specification

Generate the following data:

1. **Products:** 100 products
   - Random names, prices, categories
   - Store in primary DB

2. **Users:** 1000 users
   - Just IDs (don't need full user profiles)

3. **Orders Distribution:**
   - **Tier 2 (Hot - last 90 days):** 5,000 orders
   - **Tier 3 (Warm - 2024):** 10,000 orders
   - **Tier 4 (Cold - 2023):** 15,000 orders
   - **Total:** 30,000 orders

4. **Order Items:** 1-5 items per order (average 3)
   - Total items: ~90,000

5. **User Order Index:** 30,000 entries (one per order)

**Total Data Size Estimate:**

- Orders: 30K × 200 bytes = 6 MB
- Items: 90K × 100 bytes = 9 MB
- Index: 30K × 100 bytes = 3 MB
- Products: 100 × 1 KB = 100 KB
- **Total:** ~20 MB of data (well under 500MB constraint)

---

## 🎯 Key Features to Demonstrate

### 1. Multi-Tier Querying

```bash
# Query user orders - should fetch from multiple tiers
GET /orders/user/123?page=1&limit=20

Response:
{
  "orders": [
    { "order_id": 1, "tier": 2, "tierName": "hot", ... },
    { "order_id": 2, "tier": 3, "tierName": "warm", ... },
    { "order_id": 3, "tier": 4, "tierName": "cold", "archive_location": "archive_2023", ... }
  ],
  "total": 45,
  "page": 1,
  "limit": 20
}
```

### 2. Archive Registry Lookup

```bash
# Get archive for specific year
GET /admin/archival/archive-for-year/2023

Response:
{
  "database_name": "archive_2023",
  "host": "archive-2023",
  "port": 5432,
  "tier": 4
}
```

### 3. Database Size Monitoring

```bash
GET /admin/archival/database-sizes

Response:
{
  "primary": { "size_mb": 8, "orders_count": 5000, "tier": 2 },
  "metadata_archive": { "size_mb": 5, "orders_count": 10000, "tier": 3 },
  "archives": [
    { "name": "archive_2023", "size_mb": 7, "orders_count": 15000, "tier": 4 }
  ]
}
```

### 4. Simulated Partition Rotation

```bash
POST /admin/archival/simulate-rotation

Response:
{
  "message": "Simulated rotation of 1000 orders",
  "moved_from": "orders_recent",
  "moved_to": "metadata_archive",
  "records_moved": 1000
}
```

---

## 📝 Implementation Steps for Claude Code Agent

### Step 1: Project Setup

1. Create NestJS project structure
2. Install dependencies: `@nestjs/common`, `@nestjs/core`, `pg`, `ioredis`, `@nestjs/cache-manager`
3. Set up TypeScript configuration

### Step 2: Docker Configuration

1. Create `docker-compose.yml` with 5 PostgreSQL instances + Redis
2. Create SQL init scripts for each database
3. Create Dockerfile for NestJS app

### Step 3: Database Layer

1. Implement `DatabaseService` with connection pooling
2. Implement `ArchiveRegistryService` for dynamic routing
3. Create database configuration module

### Step 4: Core Services

1. Implement `OrdersService` with tier-based querying
2. Implement `ArchivalService` for stats and monitoring
3. Implement `PartitionRotationService` for simulation

### Step 5: Mock Data

1. Implement `DataGeneratorService`
2. Create seed scripts for products, users, orders
3. Distribute orders across tiers based on dates

### Step 6: API Layer

1. Create `OrdersController` with all endpoints
2. Create `ArchivalController` for admin operations
3. Create `MockDataController` for data generation

### Step 7: Testing & Documentation

1. Add health check endpoint
2. Create README with usage examples
3. Add Swagger/OpenAPI documentation

---

## ✅ Success Criteria

When implementation is complete, the system should:

1. ✅ Start with `docker-compose up` (all 6 containers)
2. ✅ Generate 30,000 mock orders across 3 tiers
3. ✅ Query user orders in <100ms (regardless of tier)
4. ✅ Demonstrate parallel querying across multiple archives
5. ✅ Show database size distribution (primary stays small)
6. ✅ Simulate partition rotation
7. ✅ Total Docker images + data < 500MB

---

## 🧪 Test Scenarios

```bash
# 1. Generate mock data
POST http://localhost:3000/mock-data/generate

# 2. Get user orders (spans multiple tiers)
GET http://localhost:3000/orders/user/5?page=1&limit=20

# 3. Get specific order
GET http://localhost:3000/orders/100

# 4. Get product orders (across all archives)
GET http://localhost:3000/orders/product/25/orders?limit=50

# 5. Check database sizes
GET http://localhost:3000/admin/archival/database-sizes

# 6. Get archival stats
GET http://localhost:3000/admin/archival/stats

# 7. Simulate rotation
POST http://localhost:3000/admin/archival/simulate-rotation
```

---

## 📚 Additional Requirements

### Environment Variables (.env.example)

```env
NODE_ENV=development
PORT=3000

# Primary Database
DB_PRIMARY_HOST=primary-db
DB_PRIMARY_PORT=5432
DB_PRIMARY_NAME=primary_db
DB_PRIMARY_USER=ecom_user
DB_PRIMARY_PASSWORD=ecom_pass

# Metadata Archive
DB_METADATA_HOST=metadata-archive-db
DB_METADATA_PORT=5432
DB_METADATA_NAME=metadata_archive_db
DB_METADATA_USER=ecom_user
DB_METADATA_PASSWORD=ecom_pass

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# Mock Data
MOCK_USERS_COUNT=1000
MOCK_PRODUCTS_COUNT=100
MOCK_ORDERS_HOT=5000
MOCK_ORDERS_WARM=10000
MOCK_ORDERS_COLD=15000
```

### README.md Content

````markdown
# E-commerce Multi-Archive System

Demonstrates production-grade order archival with multi-tier architecture.

## Quick Start

1. Start all services:
   ```bash
   docker-compose up -d
   ```
````

2. Wait for initialization (30 seconds)

3. Generate mock data:

   ```bash
   curl -X POST http://localhost:3000/mock-data/generate
   ```

4. Query orders:
   ```bash
   curl http://localhost:3000/orders/user/5
   ```

## Architecture

- **Tier 2 (Hot):** Last 90 days in primary DB
- **Tier 3 (Warm):** 2024 orders in metadata archive
- **Tier 4 (Cold):** 2023 orders in dedicated archive

## Key Endpoints

See API documentation at http://localhost:3000/api/docs

```

---

## 🎯 Implementation Priorities

**Priority 1 (Core):**
- Database connections and pooling
- Archive registry service
- Basic order querying (single tier)

**Priority 2 (Multi-tier):**
- User order index table
- Multi-tier query routing
- Parallel archive querying

**Priority 3 (Mock Data):**
- Data generation service
- Distribution across tiers
- Archive database registration

**Priority 4 (Advanced):**
- Partition rotation simulation
- Database size monitoring
- Performance metrics

---

## 💡 Implementation Tips

1. **Start Simple:** Get single database working first, then add multi-archive
2. **Use Transactions:** When moving data between tiers
3. **Connection Pooling:** Reuse connections for archives
4. **Async/Await:** All database operations should be async
5. **Error Handling:** Graceful degradation if archive is unavailable
6. **Logging:** Use NestJS logger to show which tier is queried
7. **Docker Health Checks:** Ensure DBs are ready before app starts

---

This specification provides everything needed to build a working, demonstrable multi-archive system under 500MB!
```
