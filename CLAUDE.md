# CLAUDE.md — AI Router for ai-native-nestjs-backend

## Project Overview

AI-native NestJS 11 boilerplate demonstrating production-ready backend patterns.
**Domain:** Todo app (TodoLists → TodoItems → Tags).
**Stack:** NestJS 11, Express, Prisma 7, PostgreSQL 16, Redis 7, BullMQ, JWT + API Key auth, OpenTelemetry, Grafana (Tempo, Loki, Prometheus).

---

## Folder Map

```
src/
├── app.module.ts          # Root module; wires all feature modules
├── main.ts                # Entry point; bootstrap + OTel SDK init
├── bootstrap/             # Graceful shutdown and process-level signal handlers
├── config/                # Zod-validated env config; AppConfigService
├── common/                # Cross-cutting: filters, middleware, interceptors, decorators, pipes, constants
├── database/              # PrismaService, PrismaModule, BaseRepository, DatabaseService, DatabaseModule, per-aggregate DbRepository + DbService
├── errors/                # ErrorException, domain error-code constants (GEN/VAL/AUT/AUZ/DAT/SRV), Prisma error handler
├── logger/                # AppLogger (Pino-backed), logger interfaces, sanitizer, trace-context util
├── telemetry/             # OTel SDK init, TelemetryService, @Trace/@InstrumentClass decorators
├── queue/                 # BullMQ QueueModule (Redis-backed)
└── modules/
    ├── auth/              # JWT + API Key auth; register, login, refresh, change-password, API key CRUD
    ├── users/             # User profile GET/PATCH (me)
    ├── health/            # /health endpoint (Terminus)
    ├── todo-lists/        # TodoList CRUD
    ├── todo-items/        # TodoItem CRUD + status transitions + BullMQ processor
    └── tags/              # Tag CRUD + assign/remove tag on TodoItem
```

---

## Routing Table

| Task                                                | Load these docs                                                                                                                          |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Add a new feature module                            | `docs/coding-guidelines/02-module-organization.md`, `docs/coding-guidelines/04-architecture-patterns.md`, `.claude/skills/add-module.md` |
| Modify auth or add a guard                          | `docs/guides/FOR-Authentication.md`, `docs/architecture/auth-flow.md`                                                                    |
| Add or change API endpoints                         | `docs/prd/todo-app-prd.md`, `docs/coding-guidelines/04-architecture-patterns.md`, `docs/guides/FOR-Todo-Module.md`                       |
| Change database schema                              | `docs/architecture/database-design.md`, `docs/coding-guidelines/06-database-patterns.md`                                                 |
| Work on the database layer (DbService/DbRepository) | `docs/guides/FOR-Database-Layer.md`, `docs/coding-guidelines/06-database-patterns.md`, `docs/architecture/service-architecture.md`       |
| Add or fix error handling                           | `docs/guides/FOR-Error-Handling.md`, `docs/coding-guidelines/07-error-handling.md`                                                       |
| Work on logging or tracing                          | `docs/guides/FOR-Observability.md`, `docs/coding-guidelines/08-logging-and-tracing.md`                                                   |
| Write or fix tests                                  | `docs/coding-guidelines/10-testing-standards.md`, `docs/coding-guidelines/11-best-practices-checklist.md`                                |
| Set up infrastructure or deploy                     | `docs/infrastructure/01-docker-setup.md`, `docs/infrastructure/03-deployment-checklist.md`                                               |
| Understand system architecture                      | `docs/architecture/high-level-architecture.md`, `docs/architecture/service-architecture.md`                                              |
| Plan a new feature                                  | `docs/plans/template.md`, `PLOT.md`                                                                                                      |

---

## NestJS DI Rules

- **Same module:** Place providers directly in `providers: []`.
- **Different module:** Export from the providing module and `imports: []` in the consuming module.
- **Globals (`@Global()`):** `AppConfigModule`, `AppLoggerModule`, `PrismaModule`, `DatabaseModule`, `TelemetryModule` — available everywhere without re-importing.
- **Never use `forwardRef`** — restructure dependencies instead (circular deps indicate a design flaw).
- **Guards, interceptors, filters** registered at the module level apply to all routes in that module.

---

## Coding Conventions

- **No hardcoded strings** — use constants from `src/common/constants/` or define a `*.constants.ts` in the module.
- **JSDoc on all public methods** — document params, return type, and thrown errors. Include `@example` blocks on non-trivial methods.
- **File names:** `kebab-case.type.ts` (e.g., `todo-list.service.ts`, `create-todo-list.dto.ts`).
- **Classes:** `PascalCase`.
- **Functions/methods:** `camelCase`.
- **Constants:** `UPPER_SNAKE_CASE`.
- **Error codes:** `PREFIX` (3 uppercase letters) + 4-digit zero-padded unique number (e.g., `DAT0001`, `AUT0006`). Prefix registry: `GEN`, `VAL`, `AUT`, `AUZ`, `DAT`, `SRV`.
- **Imports:** Use path aliases (`@common/`, `@config/`, `@database/`, `@logger/`, `@telemetry/`, `@modules/`).
- **DTOs:** Use Zod schemas inside the DTO file and pass through `ZodValidationPipe`.
- **Never expose `passwordHash`** — use `SafeUser` type from `UsersService`.

---

## Error System

Errors are represented as `ErrorException` instances (extends `Error`, NOT `HttpException`).
Domain error constants (`GEN`, `VAL`, `AUT`, `AUZ`, `DAT`, `SRV`) are the API — no string keys or factory class.

**Creating errors:**

```typescript
import { AUT, DAT, VAL, GEN } from '@errors/error-codes';
import { ErrorException } from '@errors/types/error-exception';

// Direct usage — most cases
throw new ErrorException(AUT.UNAUTHENTICATED);
throw new ErrorException(DAT.NOT_FOUND, { message: `User ${id} not found` });
throw new ErrorException(VAL.INVALID_STATUS_TRANSITION, {
  message: `Cannot go from ${from} to ${to}`,
});

// Static helpers for common parameterized patterns
throw ErrorException.notFound('User', id);
throw ErrorException.validation(zodError); // converts Zod issues
throw ErrorException.validationFromCV(cvErrors); // converts class-validator
throw ErrorException.internal(cause);
```

**Catching errors:**

```typescript
if (ErrorException.isErrorException(err)) {
  return err.toResponse(); // Safe, masks non-userFacing messages
}
const safe = ErrorException.wrap(unknownErr); // Always returns an ErrorException
```

**Error code format:** `PREFIX` (3 uppercase letters) + 4-digit zero-padded number.
Prefix registry: `GEN` (general), `VAL` (validation), `AUT` (authentication), `AUZ` (authorization), `DAT` (database/data), `SRV` (server/infrastructure).

**Message masking:** `userFacing` on the error definition controls whether the message is shown to end users. If `userFacing: false` (e.g. `SRV.INTERNAL_ERROR`), the filter masks the message to prevent leaking internal details. There is no separate `isOperational` flag.

---

## API Versioning

Routes use **NestJS URI versioning**: `/api/v{version}/path`.

- `main.ts` sets `app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })`.
- Every controller declares its version: `@Controller({ path: 'health', version: '1' })`.
- To add a v2 route, create a new controller with `version: '2'` — v1 continues to work.
- Use `VERSION_NEUTRAL` (from `@nestjs/common`) for routes that should not be versioned.

**Current version:** `v1` (all controllers). New modules must set `version: '1'` (or a higher version).

---

## Controller Decorators

Use composite decorators to reduce boilerplate:

| Decorator              | File                                              | Purpose                                                 |
| ---------------------- | ------------------------------------------------- | ------------------------------------------------------- |
| `@ApiAuth()`           | `src/common/decorators/api-auth.decorator.ts`     | Bearer auth + 401 response doc                          |
| `@ApiEndpoint(opts)`   | `src/common/decorators/api-endpoint.decorator.ts` | `@ApiOperation` + `@ApiResponse` + `@HttpCode` combined |
| `@Public()`            | `src/common/decorators/public.decorator.ts`       | Skip JWT guard on a route                               |
| `@CurrentUser(field?)` | `src/common/decorators/current-user.decorator.ts` | Extract JWT user or a specific field                    |
| `@Roles(...roles)`     | `src/common/decorators/roles.decorator.ts`        | Role-based access metadata                              |

**Example:**

```typescript
@Post()
@ApiEndpoint({
  summary: 'Create a todo list',
  successStatus: HttpStatus.CREATED,
  successDescription: 'Created successfully',
  errorResponses: [HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED],
})
async create(@Body() dto: CreateTodoListDto) {}
```

---

## Logger Contract

`AppLogger` provides three distinct methods with fixed semantics:

| Method                         | Level                       | Use case                                           |
| ------------------------------ | --------------------------- | -------------------------------------------------- |
| `logEvent(name, opts?)`        | Always INFO                 | Named structured events (lifecycle, domain events) |
| `logError(name, error, opts?)` | Always ERROR                | Caught errors with OTel span recording             |
| `log(message, opts?)`          | Configurable (default INFO) | Escape hatch for non-INFO/non-ERROR levels         |

**Do not pass `level:` to `logEvent()` or `logError()`.** If you need WARN or FATAL, use `log()`:

```typescript
// Correct
logger.logEvent('user.created', { attributes: { userId } });
logger.logError('db.query.failed', error, { attributes: { query } });
logger.log('process exiting', { level: LogLevel.FATAL, attributes: { signal } });

// Wrong — level is ignored on logEvent/logError
logger.logEvent('something.warn', { level: LogLevel.WARN }); // use log() instead
```

**CLS (Continuation Local Storage):** Request context (requestId, userId) is propagated via `ClsModule`. Services that need request-scoped context should inject `ClsService`.

---

---

## Testing Guidelines

- **Pattern:** AAA (Arrange / Act / Assert) with explicit comments.
- **Mock factories:** Place in `test/helpers/` as `create<Entity>Mock()` factory functions.
- **Unit tests:** Co-located `*.spec.ts` next to the source file.
- **E2E tests:** `test/` directory, `*.e2e-spec.ts` suffix.
- **Naming:** `describe('<ClassName>')` → `describe('<methodName>')` → `it('should <behaviour when condition>')`.
- **Never call real databases** in unit tests — mock `PrismaService` via the factory at `test/helpers/prisma.mock.ts`.
- **Coverage:** Service and repository classes must reach ≥ 80% line coverage.
