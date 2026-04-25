# 04 — Architecture Patterns

## Layered Architecture

```
HTTP Request
    ↓
Controller   — receives validated DTOs, calls service, returns response shape
    ↓
Service      — business logic, ownership checks, pool routing, SQL queries
    ↓
MultiDbService / ArchiveRegistryService  — pool manager (global, injected directly)
    ↓
pg.Pool      — raw SQL query execution (no ORM at runtime)
```

Each layer has a single responsibility. **Do not skip layers.** Feature services must inject `MultiDbService` (and optionally `ArchiveRegistryService`) from the database layer — they must **not** inject `PrismaService` for runtime queries.

> Note: `BaseRepository`, `DatabaseService`, per-entity `*DbRepository` / `*DbService` classes, and
> the Prisma `tenantScopeExtension` were removed in the feat/observability pivot. Prisma is
> retained for schema migrations only.

## Controller Rules

- Handle HTTP concerns only: parse params, call service, return data.
- Do **not** run `pg.Pool` queries directly in a controller.
- Do **not** catch errors in controllers — let filters handle them.
- Declare mock auth via `@ApiSecurity('x-user-id')` so Swagger prompts for the header. Identity (`userId`) flows through CLS, not through controller arguments.
- Use `ParseIntPipe` on integer path params; `ParseUUIDPipe` on UUID params.

```typescript
@ApiTags('orders')
@ApiSecurity('x-user-id')
@Controller({ path: 'orders', version: '1' })
export class OrdersController {
  constructor(private readonly service: OrdersService) {}

  @Get(':orderId')
  @ApiEndpoint({ summary: 'Get a single order by ID (routes to correct storage tier)' })
  async getOrder(@Param('orderId') orderId: string) {
    return this.service.getOrderById(BigInt(orderId)); // userId comes from CLS
  }
}
```

## Service Rules

- Contain all business logic: tier routing, ownership checks, SQL queries.
- Throw `ErrorException` with domain constants (`DAT`, `VAL`, `AUT`, etc.) — never throw raw `Error`.
- Use `@Trace()` on public methods that benefit from distributed tracing.
- Obtain pools from `MultiDbService` and execute raw SQL via `pool.query(...)`.
- For multi-statement transactions, use `pool.connect()` → `BEGIN` → `COMMIT` / `ROLLBACK` with `finally` release.

```typescript
@Injectable()
export class OrdersService {
  constructor(
    private readonly db: MultiDbService,
    private readonly registry: ArchiveRegistryService,
    private readonly cls: ClsService,
  ) {}

  /**
   * Fetches an order by routing to the correct tier via user_order_index.
   * @throws {ErrorException} DAT.NOT_FOUND when the order doesn't exist
   */
  @Trace('orders.getOrderById')
  async getOrderById(orderId: bigint): Promise<OrderWithItems> {
    const userId = this.cls.get<number>(ClsKey.USER_ID);
    // 1. Query user_order_index on read pool → get tier
    // 2. Route to correct pool based on tier
  }
}
```

## DbRepository Rules (Order-Management Domain)

In this domain, `*DbRepository` classes are thin wrappers around `MultiDbService`
pools. They do not extend `BaseRepository` (that class was removed). Their
responsibilities are:

- Encapsulate raw SQL for one aggregate (e.g. `OrdersDbRepository` owns all
  `orders_recent` and `user_order_index` queries).
- Accept typed inputs; return typed rows using interfaces from
  `src/database/interfaces/index.ts`.
- Pass parameterised values to `pool.query()` — never string-interpolate user input.
- Not contain business logic (tier-routing decisions belong in the service).

```typescript
@Injectable()
export class OrdersDbRepository {
  constructor(
    private readonly db: MultiDbService,
    private readonly registry: ArchiveRegistryService,
  ) {}

  /**
   * Fetch hot (tier-2) orders from orders_recent by IDs.
   */
  async findHotOrders(orderIds: bigint[]): Promise<OrderWithItems[]> {
    const pool = this.db.getReadPool(); // replica round-robin
    const { rows } = await pool.query<OrderRow>(
      `SELECT * FROM orders_recent WHERE order_id = ANY($1)`,
      [orderIds],
    );
    return rows.map(o => ({ ...o, tier: 2 as const, tierName: 'hot' as const }));
  }
}
```

## Error Propagation

Always use `ErrorException` with domain constants for errors. Import definitions from `@errors/error-codes`.

```typescript
// Good
const index = await this.ordersDb.findIndexEntry(orderId, userId);
if (!index)
  throw new ErrorException(DAT.NOT_FOUND, {
    message: `Order ${orderId} not found in any tier.`,
  });

// Also good — static helper
throw ErrorException.notFound('Order', orderId.toString());

// Bad — no context, no structured code
throw new Error('not found');
```

## Response Wrapping

All responses are automatically wrapped by `TransformInterceptor`:

```json
{ "success": true, "data": <your return value> }
```

Return the raw entity or DTO from the controller — do not wrap manually.
