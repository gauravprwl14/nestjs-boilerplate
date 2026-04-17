# 04 — Architecture Patterns

## Layered Architecture

```
HTTP Request
    ↓
Controller   — receives validated DTOs, calls service, returns response shape
    ↓
Service      — business logic, ownership checks, status transitions, queue dispatch
    ↓
*DbService   — DB-layer public API; one per aggregate; injected by feature services
    ↓
*DbRepository — Prisma calls; extends BaseRepository; no business logic
    ↓
Prisma       — database query execution
```

Each layer has a single responsibility. **Do not skip layers.** Feature services must inject `*DbService` classes from the database layer — they must **not** inject `PrismaService` or `*DbRepository` directly.

## Controller Rules

- Handle HTTP concerns only: parse params, call service, return data.
- Do **not** call Prisma directly from a controller.
- Do **not** catch errors in controllers — let filters handle them.
- Declare mock auth via `@ApiSecurity('x-user-id')` so Swagger prompts for the header. Identity flows through CLS, not through controller arguments.
- Always use `ParseUUIDPipe` on UUID path params.

```typescript
@ApiTags('Tweets')
@ApiSecurity('x-user-id')
@Controller({ version: '1' })
export class TweetsController {
  constructor(private readonly service: TweetsService) {}

  @Post('tweets')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(CreateTweetSchema))
  @ApiOperation({ summary: 'Create a tweet (scoped to the caller\'s company).' })
  async create(@Body() dto: CreateTweetDto): Promise<Tweet> {
    return this.service.create(dto); // userId + companyId come from CLS, not the request
  }
}
```

## Service Rules

- Contain all business logic: ownership checks, status transition validation, side effects.
- Throw `ErrorException` with domain constants (`DAT`, `VAL`, `AUT`, etc.) — never throw raw `Error`.
- Use `@Trace()` on public methods that benefit from distributed tracing.
- Do **not** call Prisma directly — inject the appropriate `*DbService` from the database layer.
- For cross-aggregate atomic operations inject `DatabaseService` and use `runInTransaction()`.

```typescript
@Injectable()
export class TweetsService {
  constructor(
    private readonly tweetsDb: TweetsDbService,
    private readonly departmentsDb: DepartmentsDbService,
    private readonly cls: ClsService,
  ) {}

  /**
   * Creates a tweet for the authenticated author (CLS).
   * @throws {ErrorException} VAL0007 / VAL0008 on invalid department input
   */
  @Trace('tweets.create')
  async create(dto: CreateTweetDto): Promise<Tweet> {
    const userId = this.cls.get<string>(ClsKey.USER_ID);
    const companyId = this.cls.get<string>(ClsKey.COMPANY_ID);
    // ... pre-validate departmentIds, then delegate to tweetsDb.createWithTargets
  }
}
```

## DbRepository Rules

- Extend `BaseRepository<TModel, …>` and implement `delegateFor(client)` to return the Prisma delegate.
- Wrap Prisma calls in descriptive named methods; never expose raw Prisma client to services.
- Apply soft-delete filter (`deletedAt: null`) in every query on soft-deletable models.
- All methods accept an optional `tx?: DbTransactionClient` as their last parameter.

```typescript
@Injectable()
export class DepartmentsDbRepository extends BaseRepository<Department, …> {
  // Tenant-scoped repositories route through prisma.tenantScoped when the
  // caller passed the plain root client.
  protected delegateFor(client: PrismaService | DbTransactionClient) {
    if (client === this.prisma) {
      return (this.prisma.tenantScoped as unknown as { department: Prisma.DepartmentDelegate }).department;
    }
    return (client as DbTransactionClient).department;
  }

  /**
   * Returns departments in the caller's tenant (extension adds `where.companyId` too).
   */
  async findManyByCompany(companyId: string, tx?: DbTransactionClient): Promise<Department[]> {
    return this.delegateFor(this.client(tx)).findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
  }
}
```

## Error Propagation

Always use `ErrorException` with domain constants for errors. Import definitions from `@errors/error-codes`.

```typescript
// Good
const parent = await this.departmentsDb.findByIdInCompany(parentId, companyId);
if (!parent) throw new ErrorException(DAT.DEPARTMENT_NOT_FOUND, {
  message: `Parent department ${parentId} not found in this company.`,
});

// Also good — direct definition usage
throw new ErrorException(VAL.DEPARTMENT_NOT_IN_COMPANY);

// Bad — no context, no structured code
throw new Error('not found');
```

## Response Wrapping

All responses are automatically wrapped by `TransformInterceptor`:

```json
{ "success": true, "data": <your return value> }
```

Return the raw entity or DTO from the controller — do not wrap manually.
