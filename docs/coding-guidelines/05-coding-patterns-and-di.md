# 05 — Coding Patterns and Dependency Injection

## Constructor Injection

Always use constructor injection. Do **not** use property injection (`@Inject()` on a property).

```typescript
// Good
@Injectable()
export class OrdersService {
  constructor(
    private readonly db: MultiDbService, // pool manager
    private readonly registry: ArchiveRegistryService, // year+tier routing
    private readonly cls: ClsService,
  ) {}
}

// Bad — property injection is harder to test
@Injectable()
export class OrdersService {
  @Inject(MultiDbService)
  private db: MultiDbService;
}
```

## Custom Decorators

### Parameter decorators

Use `createParamDecorator` for extracting request values. `@CurrentUser()`
reads `req.user` (populated by `MockAuthMiddleware`):

```typescript
// src/common/decorators/current-user.decorator.ts
export const CurrentUser = createParamDecorator(
  (field: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return field ? user?.[field] : user;
  },
);
```

### Composite decorators

Group repeated decorator combos. `@ApiEndpoint(opts)` merges
`@ApiOperation`, `@ApiResponse`, and `@HttpCode`:

```typescript
// src/common/decorators/api-endpoint.decorator.ts
export const ApiEndpoint = (opts: ApiEndpointOpts) =>
  applyDecorators(
    HttpCode(opts.successStatus ?? HttpStatus.OK),
    ApiOperation({ summary: opts.summary, description: opts.description }),
    ApiResponse({
      status: opts.successStatus ?? HttpStatus.OK,
      description: opts.successDescription,
    }),
    ...(opts.errorResponses?.map(s => ApiResponse({ status: s })) ?? []),
  );
```

## Guards

The only global guard is `AuthContextGuard` (registered as `APP_GUARD` in
`AppModule`). It verifies that `userId` is present in CLS.

```typescript
// Global scope — already wired in AppModule
{ provide: APP_GUARD, useClass: AuthContextGuard }

// Controller scope (rare — no role-based guards ship in this build)
@UseGuards(SomeLocalGuard)
@Controller('something')
export class SomethingController {}
```

Use the `@Public()` decorator to bypass the global `AuthContextGuard` (e.g.
Swagger docs, liveness probes):

```typescript
@Get('health')
@Public()
healthCheck() { ... }
```

## Pipes

Always use `ZodValidationPipe` for DTO validation. Apply it per-route via
`@UsePipes(new ZodValidationPipe(Schema))`. Global pipes `ValidationPipe`
(class-validator) is also registered in `main.ts` for any non-Zod DTOs.

```typescript
@Post('orders')
@UsePipes(new ZodValidationPipe(createOrderSchema))
async create(@Body() dto: CreateOrderDto) { ... }
```

For integer path params use `ParseIntPipe`; for UUID params use `ParseUUIDPipe`:

```typescript
@Get('user/:userId')
async getUserOrders(@Param('userId', ParseIntPipe) userId: number) { ... }

@Get(':id')
async findOne(@Param('id', ParseUUIDPipe) id: string) { ... }
```

## Interceptors

Interceptors are registered globally in `main.ts`:

```typescript
app.useGlobalInterceptors(
  new TimeoutInterceptor(),
  new LoggingInterceptor(logger),
  new TransformInterceptor(),
);
```

Do **not** register duplicate interceptors at controller level if they are already global.

## Async Patterns

Always use `async/await`. Never use raw `.then()/.catch()` chains in service or controller code.

```typescript
// Good
async getOrderById(orderId: bigint): Promise<OrderWithItems> {
  const userId = this.cls.get<number>(ClsKey.USER_ID);
  const pool = this.db.getReadPool();
  const { rows } = await pool.query<UserOrderIndexEntry>(
    'SELECT tier FROM user_order_index WHERE order_id = $1 AND user_id = $2',
    [orderId, userId],
  );
  if (!rows.length) throw ErrorException.notFound('Order', orderId.toString());
  // route to correct tier pool ...
}

// Bad
getOrderById(orderId: bigint): Promise<OrderWithItems> {
  return this.db.getReadPool().query('SELECT ...', [orderId])
    .then(res => {
      if (!res.rows.length) throw new Error('not found');
      // ...
    });
}
```

## Constants vs Magic Strings

Define all string constants in a `*.constants.ts` file:

```typescript
// src/common/constants/app.constants.ts
export const USER_ID_HEADER = 'x-user-id';
export const IS_PUBLIC_KEY = 'isPublic';
export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

// src/common/cls/cls.constants.ts
export enum ClsKey {
  REQUEST_ID = 'requestId',
  USER_ID = 'userId', // positive integer from x-user-id header
  TRACE_ID = 'traceId',
  SPAN_ID = 'spanId',
  // ...
}
```

Never inline header names, CLS keys, or limits as string literals in service/controller code.

> Note: `ClsKey.COMPANY_ID`, `ClsKey.USER_DEPARTMENT_IDS`, and
> `ClsKey.BYPASS_TENANT_SCOPE` were removed in the feat/observability pivot.
> The order-management domain uses `userId` as the sole auth identity key.
