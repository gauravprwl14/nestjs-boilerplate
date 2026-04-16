# 04 — Architecture Patterns

## Layered Architecture

```
HTTP Request
    ↓
Controller   — receives validated DTOs, calls service, returns response shape
    ↓
Service      — business logic, ownership checks, status transitions, queue dispatch
    ↓
Repository   — data access abstraction over Prisma; no business logic
    ↓
Prisma       — database query execution
```

Each layer has a single responsibility. **Do not skip layers.**

## Controller Rules

- Handle HTTP concerns only: parse params, call service, return data.
- Do **not** call Prisma directly from a controller.
- Do **not** catch errors in controllers — let filters handle them.
- Always use `@ApiAuth()` composite decorator on protected controllers.
- Always use `ParseUUIDPipe` on UUID path params.

```typescript
@ApiTags('Todo Lists')
@ApiAuth()
@Controller('todo-lists')
export class TodoListsController {
  constructor(private readonly todoListsService: TodoListsService) {}

  /**
   * Creates a new todo list for the current user.
   */
  @Post()
  @ApiOperation({ summary: 'Create a new todo list' })
  @ApiResponse({ status: 201, description: 'Todo list created successfully' })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateTodoListDto,
  ): Promise<TodoList> {
    return this.todoListsService.create(userId, dto);
  }
}
```

## Service Rules

- Contain all business logic: ownership checks, status transition validation, side effects.
- Throw `ErrorException` with domain constants (`DAT`, `VAL`, `AUT`, etc.) — never throw raw `Error`.
- Use `@Trace()` on public methods that benefit from distributed tracing.
- Do **not** call Prisma directly — use a repository or `PrismaService` only for atomic transactions.

```typescript
@Injectable()
export class TodoListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Creates a new todo list owned by the given user.
   * @throws {ErrorException} DAT0001 if the user does not exist
   */
  @Trace('todo-lists.create')
  async create(userId: string, dto: CreateTodoListDto): Promise<TodoList> {
    return this.prisma.todoList.create({
      data: { ...dto, userId },
    });
  }
}
```

## Repository Rules

- Wrap Prisma calls in descriptive methods; never expose raw Prisma client to services.
- Apply soft-delete filter (`deletedAt: null`) in every query by default.
- Use `BaseRepository` for common patterns (findById, softDelete).

```typescript
@Injectable()
export class TodoListRepository extends BaseRepository {
  /**
   * Finds a todo list by id, scoped to a specific user.
   * Returns null if not found or not owned by user.
   */
  async findByIdAndUser(id: string, userId: string): Promise<TodoList | null> {
    return this.prisma.todoList.findFirst({
      where: { id, userId, deletedAt: null },
    });
  }
}
```

## Error Propagation

Always use `ErrorException` with domain constants for errors. Import definitions from `@errors/error-codes`.

```typescript
// Good
const list = await this.repo.findByIdAndUser(id, userId);
if (!list) throw ErrorException.notFound('TodoList', id);

// Also good — direct definition usage
throw new ErrorException(VAL.INVALID_STATUS_TRANSITION, { message: `Cannot go from '${from}' to '${to}'` });

// Bad — no context, no structured code
throw new Error('not found');
```

## Response Wrapping

All responses are automatically wrapped by `TransformInterceptor`:

```json
{ "success": true, "data": <your return value> }
```

Return the raw entity or DTO from the controller — do not wrap manually.
