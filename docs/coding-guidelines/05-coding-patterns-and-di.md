# 05 — Coding Patterns and Dependency Injection

## Constructor Injection

Always use constructor injection. Do **not** use property injection (`@Inject()` on a property).

```typescript
// Good
@Injectable()
export class TweetsService {
  constructor(
    private readonly tweetsDb: TweetsDbService, // inject the DbService, not PrismaService
    private readonly departmentsDb: DepartmentsDbService,
    private readonly cls: ClsService,
  ) {}
}

// Bad — property injection is harder to test
@Injectable()
export class TweetsService {
  @Inject(PrismaService)
  private prisma: PrismaService;
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
    ApiResponse({ status: opts.successStatus ?? HttpStatus.OK, description: opts.successDescription }),
    ...opts.errorResponses?.map((s) => ApiResponse({ status: s })) ?? [],
  );
```

## Guards

The only global guard is `AuthContextGuard` (registered as `APP_GUARD` in
`AppModule`). It verifies that `companyId` is present in CLS.

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
@Post('tweets')
@UsePipes(new ZodValidationPipe(CreateTweetSchema))
async create(@Body() dto: CreateTweetDto) { ... }
```

For UUID path params use `ParseUUIDPipe`:

```typescript
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
async create(dto: CreateTweetDto): Promise<Tweet> {
  const companyId = this.cls.get<string>(ClsKey.COMPANY_ID);
  const existing = await this.departmentsDb.findExistingIdsInCompany(ids, companyId);
  if (existing.length !== ids.length) throw new ErrorException(VAL.DEPARTMENT_NOT_IN_COMPANY);
  return this.tweetsDb.createWithTargets({ ... });
}

// Bad
create(dto: CreateTweetDto): Promise<Tweet> {
  return this.departmentsDb.findExistingIdsInCompany(ids, companyId)
    .then(existing => {
      if (existing.length !== ids.length) throw new Error('bad');
      return this.tweetsDb.createWithTargets({ ... });
    });
}
```

## Constants vs Magic Strings

Define all string constants in a `*.constants.ts` file:

```typescript
// src/common/constants/app.constants.ts
export const USER_ID_HEADER = 'x-user-id';
export const IS_PUBLIC_KEY = 'isPublic';
export const DEFAULT_TIMELINE_LIMIT = 100;
export const MAX_TWEET_CONTENT_LENGTH = 280;

// src/common/cls/cls.constants.ts
export enum ClsKey {
  USER_ID = 'userId',
  COMPANY_ID = 'companyId',
  USER_DEPARTMENT_IDS = 'userDepartmentIds',
  BYPASS_TENANT_SCOPE = 'bypassTenantScope',
  // ...
}
```

Never inline header names, CLS keys, or limits as string literals in service/controller code.
