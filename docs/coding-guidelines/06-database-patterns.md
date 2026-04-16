# 06 — Database Patterns

## Prisma Usage Rules

- All database access goes through `PrismaService` (injected via DI).
- The Prisma client is configured with the `@prisma/adapter-pg` native driver adapter — do not instantiate `PrismaClient` directly.
- Always use `select` or `include` explicitly — avoid returning columns like `passwordHash` by accident.

## Soft Delete

`User`, `TodoList`, and `TodoItem` are soft-deleted by setting `deletedAt = now()`. **Never hard-delete these records.**

```typescript
// Soft delete — correct
await this.prisma.todoList.update({
  where: { id },
  data: { deletedAt: new Date() },
});

// Hard delete — WRONG for soft-deletable entities
await this.prisma.todoList.delete({ where: { id } });
```

Every `findUnique`, `findFirst`, and `findMany` on soft-deletable tables **must** include:

```typescript
where: {
  deletedAt: null;
}
```

Use `BaseRepository.findActiveById()` for the common case to avoid forgetting this filter.

## Ownership Checks

Before any mutation, verify the record belongs to the requesting user. Combine the ownership check with the fetch to avoid two round trips:

```typescript
const list = await this.prisma.todoList.findFirst({
  where: { id, userId, deletedAt: null },
});
if (!list) throw ErrorException.notFound('TodoList', id);
```

## Transactions

Use `prisma.$transaction()` when multiple writes must succeed atomically:

```typescript
await this.prisma.$transaction(async tx => {
  await tx.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await tx.refreshToken.create({
    data: { userId, token, expiresAt },
  });
});
```

## Pagination

Use the `PaginationParams` interface from `@common/interfaces` and return `PaginatedResult<T>`:

```typescript
async findAll(userId: string, params: PaginationParams): Promise<PaginatedResult<TodoList>> {
  const { page = 1, limit = 20 } = params;
  const skip = (page - 1) * limit;

  const [items, total] = await this.prisma.$transaction([
    this.prisma.todoList.findMany({
      where: { userId, deletedAt: null },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    this.prisma.todoList.count({ where: { userId, deletedAt: null } }),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}
```

## Select / Include Best Practices

```typescript
// Good — explicit select prevents leaking passwordHash
await this.prisma.user.findUnique({
  where: { id },
  select: {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    role: true,
    status: true,
  },
});

// Bad — returns passwordHash
await this.prisma.user.findUnique({ where: { id } });
```

## Migration Workflow

```bash
# Create and apply a new migration in dev
npm run prisma:migrate:dev -- --name <description>

# Apply pending migrations in production
npm run prisma:migrate:deploy

# After schema change, regenerate Prisma Client
npm run prisma:generate
```

Never edit migration SQL files manually after they have been applied to any environment.
