# 05 — Coding Patterns and Dependency Injection

## Constructor Injection

Always use constructor injection. Do **not** use property injection (`@Inject()` on a property).

```typescript
// Good
@Injectable()
export class TodoListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
    private readonly queue: Queue,
  ) {}
}

// Bad — property injection is harder to test
@Injectable()
export class TodoListsService {
  @Inject(PrismaService)
  private prisma: PrismaService;
}
```

## Custom Decorators

### Parameter decorators

Use `createParamDecorator` for extracting request values:

```typescript
// src/common/decorators/current-user.decorator.ts
export const CurrentUser = createParamDecorator(
  (field: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as JwtPayload;
    return field ? user?.[field] : user;
  },
);
```

### Composite decorators

Group repeated decorator combos:

```typescript
// src/common/decorators/api-auth.decorator.ts
export const ApiAuth = () =>
  applyDecorators(
    UseGuards(JwtAuthGuard),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Unauthorized' }),
  );
```

## Guards

Register guards at the module level (via `APP_GUARD`) for global scope, or at the controller/method level for scoped scope.

```typescript
// Global scope — applied to every route
{ provide: APP_GUARD, useClass: JwtAuthGuard }

// Controller scope
@UseGuards(RolesGuard)
@Controller('admin')
export class AdminController {}
```

Use the `@Public()` decorator to bypass the global `JwtAuthGuard`:

```typescript
@Post('login')
@Public()
async login(@Body() dto: LoginDto) { ... }
```

## Pipes

Always use `ZodValidationPipe` for DTO validation. Register globally in `main.ts`:

```typescript
app.useGlobalPipes(new ZodValidationPipe());
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
  new TransformInterceptor(),
  new LoggingInterceptor(logger),
  new TimeoutInterceptor(),
);
```

Do **not** register duplicate interceptors at controller level if they are already global.

## Async Patterns

Always use `async/await`. Never use raw `.then()/.catch()` chains in service or controller code.

```typescript
// Good
async findOne(id: string): Promise<TodoList> {
  const list = await this.prisma.todoList.findUnique({ where: { id } });
  if (!list) throw ErrorFactory.notFound('TodoList', id);
  return list;
}

// Bad
findOne(id: string): Promise<TodoList> {
  return this.prisma.todoList.findUnique({ where: { id } })
    .then(list => {
      if (!list) throw new Error('not found');
      return list;
    });
}
```

## Constants vs Magic Strings

Define all string constants in a `*.constants.ts` file:

```typescript
// src/modules/todo-items/todo-items.constants.ts
export const TODO_ITEM_QUEUE_NAME = 'todo-item-events';
export const TODO_ITEM_COMPLETED_JOB = 'todo-item-completed';
```

Never inline queue names, event names, or config keys as string literals in service/controller code.
