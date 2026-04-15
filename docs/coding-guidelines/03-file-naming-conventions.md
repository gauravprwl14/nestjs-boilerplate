# 03 — File Naming Conventions

## Pattern: `<kebab-case-name>.<type>.ts`

| Type | Suffix | Example |
|------|--------|---------|
| Module | `.module.ts` | `todo-lists.module.ts` |
| Controller | `.controller.ts` | `todo-lists.controller.ts` |
| Service | `.service.ts` | `todo-lists.service.ts` |
| Repository | `.repository.ts` | `base.repository.ts` |
| DTO | `.dto.ts` | `create-todo-list.dto.ts` |
| Guard | `.guard.ts` | `jwt-auth.guard.ts` |
| Strategy | `.strategy.ts` | `jwt.strategy.ts`, `api-key.strategy.ts` |
| Interceptor | `.interceptor.ts` | `logging.interceptor.ts` |
| Filter | `.filter.ts` | `all-exceptions.filter.ts` |
| Pipe | `.pipe.ts` | `zod-validation.pipe.ts` |
| Middleware | `.middleware.ts` | `request-id.middleware.ts` |
| Decorator | `.decorator.ts` | `current-user.decorator.ts` |
| Processor | `.processor.ts` | `todo-item.processor.ts` |
| Constants | `.constants.ts` | `app.constants.ts`, `otel.constants.ts` |
| Interface | `.interfaces.ts` | `telemetry.interfaces.ts` |
| Schema | `.schema.ts` | `env.schema.ts` |
| Unit test | `.spec.ts` | `todo-lists.service.spec.ts` |
| E2E test | `.e2e-spec.ts` | `todo-lists.e2e-spec.ts` |

## Symbol Naming

| Symbol | Convention | Example |
|--------|-----------|---------|
| Class | `PascalCase` | `TodoListsService`, `AppError` |
| Interface | `PascalCase` | `ApiResponse`, `PaginatedResult` |
| Enum | `PascalCase` (Prisma generates these) | `TodoStatus`, `UserRole` |
| Function / method | `camelCase` | `findAll()`, `createTodoItem()` |
| Variable / parameter | `camelCase` | `todoList`, `userId` |
| Constant (module-level) | `UPPER_SNAKE_CASE` | `DEFAULT_APP_PORT`, `QUEUE_NAME` |
| Injection token | `UPPER_SNAKE_CASE` | `LOGGER_TOKEN`, `CONFIG_SERVICE_TOKEN` |
| Decorator | `PascalCase` (class deco) or `camelCase` (param deco) | `@Trace()`, `@CurrentUser()` |

## DTO Naming Pattern

DTOs follow the CRUD verb + entity pattern:

- `Create<Entity>Dto` — POST body
- `Update<Entity>Dto` — PATCH body (all fields optional)
- `Query<Entity>sDto` — GET query string (pagination + filters)

## Path Aliases

Use these instead of relative `../../` imports:

| Alias | Resolves to |
|-------|------------|
| `@common/` | `src/common/` |
| `@config/` | `src/config/` |
| `@database/` | `src/database/` |
| `@logger/` | `src/logger/` |
| `@telemetry/` | `src/telemetry/` |
| `@modules/` | `src/modules/` |
| `@errors/` | `src/errors/` |

Example:

```typescript
// Good
import { AppLogger } from '@logger/logger.service';
import { ErrorFactory } from '@errors/types/error-factory';

// Bad
import { AppLogger } from '../../logger/logger.service';
```
