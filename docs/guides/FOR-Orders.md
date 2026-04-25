# FOR-Orders.md — Orders Feature Guide

> Related: `docs/guides/FOR-Database-Layer.md`,
> `docs/architecture/database-design.md`,
> `docs/architecture/service-architecture.md`

> **Status:** OrdersModule is fully implemented. `OrdersController`, `OrdersService`,
> `OrdersDbRepository`, and `OrdersDbService` are all wired in `DatabaseModule` and
> `AppModule`.

---

## 1. Business Use Case

The Orders module provides HTTP endpoints to create, retrieve, and list orders
across a multi-tier storage topology:

- **Hot tier (tier 2)** — recent orders stored in `orders_recent` on the
  primary PostgreSQL DB; reads served from read replicas.
- **Warm tier (tier 3)** — orders 1–2 years old stored in the metadata
  archive DB.
- **Cold tier (tier 4)** — orders older than 2 years stored in per-year
  cold-archive databases managed by `ArchiveRegistryService`.

`UserOrderIndex` (primary DB) is the global routing table: for any `(userId,
orderId)` pair it records which `tier` holds the data and an optional
`archiveLocation` hint.

---

## 2. Flow Diagram

```
GET /api/v1/orders/:id
    │
    ├─ MockAuthMiddleware  → resolve userId from x-user-id
    ├─ AuthContextGuard   → confirm CLS has userId
    ├─ OrdersController   → delegate to OrdersService
    └─ OrdersService
            │
            ├─ query user_order_index on primary → get tier + archiveLocation
            ├─ tier 2 → MultiDbService.getReadPool()       → orders_recent
            ├─ tier 3 → MultiDbService.getMetadataPool()   → orders (warm archive)
            └─ tier 4 → ArchiveRegistryService.getPoolForYear(year, 4) → orders (cold archive)
```

---

## 3. Code Structure

```
src/modules/orders/
├── orders.module.ts              # Module registration
├── orders.controller.ts          # HTTP route handlers
├── orders.service.ts             # Business logic + tier routing
├── interfaces/order-response.interface.ts  # Response shape
└── dto/
    ├── create-order.dto.ts       # Zod schema + CreateOrderDto type
    └── query-orders.dto.ts       # Zod schema + pagination params

src/database/orders/
├── orders.db-repository.ts      # Raw pg SQL for orders_recent, user_order_index, warm/cold tiers
└── orders.db-service.ts         # Service wrapper exported by DatabaseModule
```

Key supporting types in `src/database/interfaces/index.ts`:

- `OrderRow` — raw order columns from any tier
- `OrderItemRow` — raw item columns from any tier
- `OrderWithItems` — full order + items + tier metadata
- `UserOrderIndexEntry` — row from `user_order_index`
- `DbTier` — `2 | 3 | 4`

---

## 4. Key Methods

### OrdersService / OrdersDbRepository

| Method                                   | Description                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| `getOrderById(orderId)`                  | Looks up `user_order_index`, then fetches from the correct tier pool             |
| `getUserOrders(userId, page, limit)`     | Paginates `user_order_index` entries, then batch-fetches from each tier          |
| `createOrder(userId, dto)`               | Writes to primary pool; inserts into `user_order_index` with `tier = 2`          |
| `findIndexByUser(userId, limit, offset)` | Paginated `user_order_index` rows (read replica)                                 |
| `findHotOrders(orderIds)`                | Fetches `orders_recent` rows with joined `order_items_recent` (read replica)     |
| `findWarmOrders(orderIds)`               | Fetches from `order_metadata_archive` on metadata pool (tier 3)                  |
| `findColdOrder(orderId, year)`           | Fetches from per-year cold archive via `ArchiveRegistryService.getPoolForYear()` |

---

## 5. Error Cases

| Scenario                    | Error Code                  | HTTP Status |
| --------------------------- | --------------------------- | ----------- |
| Order not found in any tier | `DAT.NOT_FOUND` (`DAT0001`) | 404         |
| Archive pool unavailable    | `SRV.INTERNAL_ERROR`        | 500         |
| Missing `x-user-id` header  | `AUT0001`                   | 401         |

---

## 6. Configuration

Pool credentials and host/port settings are read from env vars by
`MultiDbService` at startup. Cold-archive pool details come from the
`archive_databases` table (loaded by `ArchiveRegistryService.onModuleInit`).

See `docs/infrastructure/02-environment-configuration.md` § Database for the
full env-var reference.
