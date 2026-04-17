# 10 — Testing Standards

## Test Structure: AAA Pattern

Every test must follow Arrange / Act / Assert with explicit comments:

```typescript
it('should throw VAL0008 when departmentIds span another tenant', async () => {
  // Arrange
  const dto = { content: 'hi', visibility: 'DEPARTMENTS', departmentIds: [ID1, ID2] };
  cls.set(ClsKey.USER_ID, 'u-1'); cls.set(ClsKey.COMPANY_ID, 'c-1');
  departmentsDbMock.findExistingIdsInCompany.mockResolvedValue([ID1]); // only 1 of 2 valid

  // Act
  const act = () => service.create(dto);

  // Assert
  await expect(act()).rejects.toThrow(ErrorException);
  await expect(act()).rejects.toMatchObject({ code: 'VAL0008' });
});
```

## Naming Convention

```
describe('TweetsService')             ← class name
  describe('create')                  ← method name
    it('should throw AUT0001 when CLS has no userId')
    it('should throw VAL0007 when DEPARTMENTS visibility is missing departmentIds')
    it('should throw VAL0008 when referenced departments include cross-tenant ids')
    it('should delegate to TweetsDbService.createWithTargets on the happy path')
```

## Mock Factories

Reusable factories live in `test/helpers/factories.ts`:

```typescript
// test/helpers/factories.ts
export const createTweetMock = (overrides: Partial<Tweet> = {}): Tweet => ({
  id: 't-uuid',
  companyId: 'c-uuid',
  authorId: 'u-uuid',
  content: 'hello',
  visibility: 'COMPANY',
  createdAt: new Date(),
  ...overrides,
});
```

## Mocking the Database Layer

Feature services inject `*DbService` classes (not `PrismaService` directly). Mock at the `*DbService` level:

```typescript
import { TweetsDbService } from '@database/tweets/tweets.db-service';
import { DepartmentsDbService } from '@database/departments/departments.db-service';

const tweetsDbMock = {
  createWithTargets: jest.fn(),
  findTimelineForUser: jest.fn(),
};
const departmentsDbMock = {
  findManyByCompany: jest.fn(),
  findByIdInCompany: jest.fn(),
  findExistingIdsInCompany: jest.fn(),
  create: jest.fn(),
};

const module = await Test.createTestingModule({
  providers: [
    TweetsService,
    { provide: TweetsDbService, useValue: tweetsDbMock },
    { provide: DepartmentsDbService, useValue: departmentsDbMock },
    { provide: ClsService, useValue: new ClsService() /* or a mock */ },
  ],
}).compile();
```

For repository-level unit tests (testing `*DbRepository` directly), use the shared Prisma mock from `test/helpers/mock-prisma.ts`:

```typescript
import { createMockPrisma } from 'test/helpers/mock-prisma';

const prismaMock = createMockPrisma();

const module = await Test.createTestingModule({
  providers: [TweetsDbRepository, { provide: PrismaService, useValue: prismaMock }],
}).compile();
```

## Unit Test Setup Template

```typescript
describe('TweetsService', () => {
  let service: TweetsService;
  let tweetsDbMock: jest.Mocked<TweetsDbService>;
  let departmentsDbMock: jest.Mocked<DepartmentsDbService>;
  let cls: ClsService;

  beforeEach(async () => {
    tweetsDbMock = {
      createWithTargets: jest.fn(),
      findTimelineForUser: jest.fn(),
    } as unknown as jest.Mocked<TweetsDbService>;

    departmentsDbMock = {
      findExistingIdsInCompany: jest.fn(),
    } as unknown as jest.Mocked<DepartmentsDbService>;

    const module = await Test.createTestingModule({
      imports: [ClsModule.forRoot({ global: true, middleware: { mount: false } })],
      providers: [
        TweetsService,
        { provide: TweetsDbService, useValue: tweetsDbMock },
        { provide: DepartmentsDbService, useValue: departmentsDbMock },
      ],
    }).compile();

    service = module.get(TweetsService);
    cls = module.get(ClsService);
  });

  afterEach(() => jest.clearAllMocks());
});
```

## Integration Tests

`test/integration/acl-matrix.spec.ts` runs the 13-case visibility matrix
against a real PostgreSQL test database. Do NOT stub Postgres for this test —
its whole purpose is to exercise the recursive CTE and composite FKs.

## E2E Test Template

```typescript
describe('Tweets (e2e)', () => {
  let app: INestApplication;
  let aliceId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    applyGlobalSetup(app); // pipes, filters, interceptors, versioning
    await app.init();
    aliceId = await seedAliceAndGetUserId();
  });

  afterAll(() => app.close());

  it('POST /tweets → 201', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/tweets')
      .set('x-user-id', aliceId)
      .send({ content: 'hello', visibility: 'COMPANY' });

    expect(res.status).toBe(201);
    expect(res.body.data.content).toBe('hello');
  });

  it('GET /timeline without x-user-id → 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/timeline');
    expect(res.status).toBe(401);
    expect(res.body.errors[0].code).toBe('AUT0001');
  });
});
```

## Coverage Requirements

| File type                                 | Minimum line coverage |
| ----------------------------------------- | --------------------- |
| `*.service.ts`                            | 80%                   |
| `*.db-repository.ts`                      | 80%                   |
| `*.db-service.ts`                         | 80%                   |
| `*.controller.ts`                         | 60% (covered by e2e)  |
| `*.filter.ts`                             | 80%                   |
| `*.guard.ts` / `*.middleware.ts`          | 80%                   |
| `*.extension.ts` (tenant-scope)           | 80%                   |

Run coverage: `npm run test:cov`. Global threshold ≥ 70%.
