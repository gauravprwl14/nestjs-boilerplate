# 10 — Testing Standards

## Test Structure: AAA Pattern

Every test must follow Arrange / Act / Assert with explicit comments:

```typescript
it('should return 404 when todo list does not exist', async () => {
  // Arrange
  const userId = 'user-uuid';
  const listId = 'non-existent-uuid';
  prismaMock.todoList.findFirst.mockResolvedValue(null);

  // Act
  const act = () => service.findOne(userId, listId);

  // Assert
  await expect(act()).rejects.toThrow(ErrorException);
  await expect(act()).rejects.toMatchObject({ code: 'DAT0001' });
});
```

## Naming Convention

```
describe('TodoListsService')          ← class name
  describe('findOne')                  ← method name
    it('should return the list when found and owned by user')
    it('should throw ErrorException(DAT.NOT_FOUND) when list does not exist')
    it('should throw ErrorException(DAT.NOT_FOUND) when list belongs to another user')
```

## Mock Factories

Create reusable mock factories in `test/helpers/`:

```typescript
// test/helpers/todo-list.mock.ts
export const createTodoListMock = (overrides: Partial<TodoList> = {}): TodoList => ({
  id: 'list-uuid',
  title: 'My List',
  description: null,
  userId: 'user-uuid',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...overrides,
});
```

## PrismaService Mock

Use the shared Prisma mock from `test/helpers/prisma.mock.ts`:

```typescript
import { createPrismaMock } from 'test/helpers/prisma.mock';

const prismaMock = createPrismaMock();

const module = await Test.createTestingModule({
  providers: [TodoListsService, { provide: PrismaService, useValue: prismaMock }],
}).compile();
```

## Unit Test Setup Template

```typescript
describe('TodoListsService', () => {
  let service: TodoListsService;
  let prismaMock: ReturnType<typeof createPrismaMock>;

  beforeEach(async () => {
    prismaMock = createPrismaMock();
    const module = await Test.createTestingModule({
      providers: [
        TodoListsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AppLogger, useValue: { logEvent: jest.fn(), logError: jest.fn() } },
      ],
    }).compile();

    service = module.get(TodoListsService);
  });

  afterEach(() => jest.clearAllMocks());
});
```

## E2E Test Template

```typescript
describe('TodoLists (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    applyGlobalSetup(app); // pipes, filters, interceptors
    await app.init();

    // Register + login to get a token
    accessToken = await loginTestUser(app);
  });

  afterAll(() => app.close());

  it('POST /todo-lists → 201', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/todo-lists')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'E2E Test List' });

    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('E2E Test List');
  });
});
```

## Coverage Requirements

| File type         | Minimum line coverage |
| ----------------- | --------------------- |
| `*.service.ts`    | 80%                   |
| `*.repository.ts` | 80%                   |
| `*.controller.ts` | 60% (covered by e2e)  |
| `*.filter.ts`     | 80%                   |
| `*.guard.ts`      | 80%                   |

Run coverage: `npm run test:cov`
