# 10 — Testing Standards

## Test Structure: AAA Pattern

Every test must follow Arrange / Act / Assert with explicit comments:

```typescript
it('should throw DAT.NOT_FOUND when order does not exist in any tier', async () => {
  // Arrange
  cls.set(ClsKey.USER_ID, 42);
  ordersDbMock.findIndexByUser.mockResolvedValue({ entries: [], total: 0 });

  // Act
  const act = () => service.getOrderById(BigInt(999));

  // Assert
  await expect(act()).rejects.toThrow(ErrorException);
  await expect(act()).rejects.toMatchObject({ code: 'DAT0001' });
});
```

## Naming Convention

```
describe('OrdersService')             ← class name
  describe('getOrderById')            ← method name
    it('should throw AUT0001 when CLS has no userId')
    it('should throw DAT.NOT_FOUND when order is missing from user_order_index')
    it('should route to replica pool for tier-2 orders')
    it('should route to metadata pool for tier-3 orders')
    it('should route to archive pool for tier-4 orders')
```

## Mock Factories

Reusable factories live in `test/helpers/factories.ts`:

```typescript
// test/helpers/factories.ts
export const createOrderMock = (overrides: Partial<OrderRow> = {}): OrderRow => ({
  order_id: BigInt(1),
  user_id: BigInt(1),
  order_number: 'ORD-001',
  total_amount: '99.99',
  status: 'completed',
  shipping_address: {},
  payment_method: 'card',
  payment_last4: null,
  coupon_code: null,
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});
```

## Mocking the Database Layer

Feature services inject `MultiDbService` and `ArchiveRegistryService`. Mock at the pool method level:

```typescript
import { MultiDbService } from '@database/multi-db.service';
import { ArchiveRegistryService } from '@database/archive-registry.service';

const mockPool = { query: jest.fn() };
const multiDbMock = {
  getPrimaryPool: jest.fn().mockReturnValue(mockPool),
  getReadPool: jest.fn().mockReturnValue(mockPool),
  getMetadataPool: jest.fn().mockReturnValue(mockPool),
  getArchivePool: jest.fn().mockReturnValue(mockPool),
};
const registryMock = {
  getPoolForYear: jest.fn().mockReturnValue(mockPool),
  getArchiveForYear: jest.fn(),
  getPoolForArchive: jest.fn().mockReturnValue(mockPool),
  getAllArchives: jest.fn().mockReturnValue(new Map()),
};

const module = await Test.createTestingModule({
  providers: [
    OrdersService,
    { provide: MultiDbService, useValue: multiDbMock },
    { provide: ArchiveRegistryService, useValue: registryMock },
    { provide: ClsService, useValue: new ClsService() },
  ],
}).compile();
```

For `*DbRepository` unit tests, mock `MultiDbService` the same way — no Prisma mock needed for runtime paths. Use `test/helpers/mock-prisma.ts` only when testing migration-related PrismaService usage.

## Unit Test Setup Template

```typescript
describe('OrdersService', () => {
  let service: OrdersService;
  let multiDbMock: jest.Mocked<MultiDbService>;
  let registryMock: jest.Mocked<ArchiveRegistryService>;
  let cls: ClsService;

  beforeEach(async () => {
    const mockPool = { query: jest.fn() };
    multiDbMock = {
      getPrimaryPool: jest.fn().mockReturnValue(mockPool),
      getReadPool: jest.fn().mockReturnValue(mockPool),
      getMetadataPool: jest.fn().mockReturnValue(mockPool),
    } as unknown as jest.Mocked<MultiDbService>;

    registryMock = {
      getPoolForYear: jest.fn().mockReturnValue(mockPool),
    } as unknown as jest.Mocked<ArchiveRegistryService>;

    const module = await Test.createTestingModule({
      imports: [ClsModule.forRoot({ global: true, middleware: { mount: false } })],
      providers: [
        OrdersService,
        { provide: MultiDbService, useValue: multiDbMock },
        { provide: ArchiveRegistryService, useValue: registryMock },
      ],
    }).compile();

    service = module.get(OrdersService);
    cls = module.get(ClsService);
  });

  afterEach(() => jest.clearAllMocks());
});
```

## Integration Tests

`test/integration/multi-tier-routing.spec.ts` runs tier-routing scenarios
against a real PostgreSQL test database. Do NOT stub Postgres for this test —
its purpose is to exercise `user_order_index` routing and pool switching.

## E2E Test Template

```typescript
describe('Orders (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    applyGlobalSetup(app); // pipes, filters, interceptors, versioning
    await app.init();
  });

  afterAll(() => app.close());

  it('POST /orders → 201', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('x-user-id', '1')
      .query({ userId: 1 })
      .send({
        /* order payload */
      });

    expect(res.status).toBe(201);
  });

  it('GET /orders/1 without x-user-id → 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/orders/1');
    expect(res.status).toBe(401);
    expect(res.body.errors[0].code).toBe('AUT0001');
  });
});
```

## Coverage Requirements

| File type                        | Minimum line coverage |
| -------------------------------- | --------------------- |
| `*.service.ts`                   | 80%                   |
| `*.db-repository.ts`             | 80%                   |
| `*.db-service.ts`                | 80%                   |
| `*.controller.ts`                | 60% (covered by e2e)  |
| `*.filter.ts`                    | 80%                   |
| `*.guard.ts` / `*.middleware.ts` | 80%                   |
| `multi-db.service.ts`            | 80%                   |

Run coverage: `npm run test:cov`. Global threshold ≥ 70%.
