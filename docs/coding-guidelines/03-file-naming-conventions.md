# 03 — File Naming Conventions

## Pattern: `<kebab-case-name>.<type>.ts`

| Type        | Suffix            | Example                                      |
| ----------- | ----------------- | -------------------------------------------- |
| Module      | `.module.ts`      | `tweets.module.ts`, `departments.module.ts`  |
| Controller  | `.controller.ts`  | `tweets.controller.ts`                       |
| Service     | `.service.ts`     | `tweets.service.ts`                          |
| Repository  | `.repository.ts`  | `base.repository.ts`                         |
| DbRepository| `.db-repository.ts` | `tweets.db-repository.ts`                  |
| DbService   | `.db-service.ts`  | `tweets.db-service.ts`                       |
| DTO         | `.dto.ts`         | `create-tweet.dto.ts`                        |
| Guard       | `.guard.ts`       | `auth-context.guard.ts`                      |
| Extension   | `.extension.ts`   | `tenant-scope.extension.ts`                  |
| Interceptor | `.interceptor.ts` | `logging.interceptor.ts`                     |
| Filter      | `.filter.ts`      | `all-exceptions.filter.ts`                   |
| Pipe        | `.pipe.ts`        | `zod-validation.pipe.ts`                     |
| Middleware  | `.middleware.ts`  | `mock-auth.middleware.ts`                    |
| Decorator   | `.decorator.ts`   | `current-user.decorator.ts`                  |
| Constants   | `.constants.ts`   | `app.constants.ts`, `cls.constants.ts`       |
| Interface   | `.interfaces.ts`  | `telemetry.interfaces.ts`                    |
| Schema      | `.schema.ts`      | `env.schema.ts`                              |
| Unit test   | `.spec.ts`        | `tweets.service.spec.ts`                     |
| E2E test    | `.e2e-spec.ts`    | `tweets.e2e-spec.ts`                         |

## Symbol Naming

| Symbol                  | Convention                                            | Example                                |
| ----------------------- | ----------------------------------------------------- | -------------------------------------- |
| Class                   | `PascalCase`                                          | `TweetsService`, `ErrorException`      |
| Interface               | `PascalCase`                                          | `ApiResponse`, `TimelineRow`           |
| Enum                    | `PascalCase` (Prisma generates these)                 | `TweetVisibility`                      |
| Function / method       | `camelCase`                                           | `findTimelineForUser()`, `buildTree()` |
| Variable / parameter    | `camelCase`                                           | `companyId`, `departmentIds`           |
| Constant (module-level) | `UPPER_SNAKE_CASE`                                    | `DEFAULT_APP_PORT`, `USER_ID_HEADER`   |
| Injection token         | `UPPER_SNAKE_CASE`                                    | `LOGGER_TOKEN`                         |
| Decorator               | `PascalCase` (class deco) or `camelCase` (param deco) | `@Trace()`, `@CurrentUser()`           |

## DTO Naming Pattern

DTOs follow the CRUD verb + entity pattern:

- `Create<Entity>Dto` — POST body
- `Update<Entity>Dto` — PATCH body (all fields optional)
- `Query<Entity>sDto` — GET query string (pagination + filters)

## Path Aliases

Use these instead of relative `../../` imports:

| Alias         | Resolves to      |
| ------------- | ---------------- |
| `@common/`    | `src/common/`    |
| `@config/`    | `src/config/`    |
| `@database/`  | `src/database/`  |
| `@logger/`    | `src/logger/`    |
| `@telemetry/` | `src/telemetry/` |
| `@modules/`   | `src/modules/`   |
| `@errors/`    | `src/errors/`    |

Example:

```typescript
// Good
import { AppLogger } from '@logger/logger.service';
import { ErrorException } from '@errors/types/error-exception';

// Bad
import { AppLogger } from '../../logger/logger.service';
```
