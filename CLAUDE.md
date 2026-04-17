# CLAUDE.md — AI Router for enterprise-twitter backend

## Project Overview

Multi-tenant NestJS 11 backend for the Enterprise Twitter take-home assignment
(see `QUESTION.md`).
**Domain:** Companies → Users → Departments (tree) → Tweets with three-level
visibility (`COMPANY` / `DEPARTMENTS` / `DEPARTMENTS_AND_SUBDEPARTMENTS`).
**Auth:** mocked via `x-user-id` header (JWT + API Key stack has been
stripped).
**Stack:** NestJS 11, Express, Prisma 7 (native `@prisma/adapter-pg`),
PostgreSQL 16, Zod validation, Pino + nestjs-cls for request-scoped tenant
context, OpenTelemetry scaffolding (disabled by default).

---

## Folder Map

```
src/
├── app.module.ts                  # Root module; wires CLS, config, logger, DB, feature modules
├── main.ts                        # Bootstrap + OTel SDK init + Swagger + fallback error handler
├── bootstrap/                     # Graceful shutdown and process-level signal handlers
├── config/                        # Zod-validated env config; AppConfigService
├── common/
│   ├── cls/                       # AsyncLocalStorage module + ClsKey enum
│   ├── constants/                 # Route constants (USER_ID_HEADER, IS_PUBLIC_KEY, limits, …)
│   ├── decorators/                # @Public, @CurrentUser, @ApiEndpoint
│   ├── filters/                   # AllExceptionsFilter (thin)
│   ├── guards/                    # AuthContextGuard (global APP_GUARD)
│   ├── interceptors/              # Transform / Logging / Timeout
│   ├── interfaces/                # ApiResponse, PaginationParams
│   ├── middleware/                # RequestId, SecurityHeaders, MockAuth
│   └── pipes/                     # ZodValidationPipe, ParseUuidPipe
├── database/
│   ├── prisma/schema.prisma       # Company/User/Department/UserDepartment/Tweet/TweetDepartment
│   ├── prisma/migrations/         # init_enterprise_twitter
│   ├── prisma.service.ts          # Base + tenantScoped client (via $extends)
│   ├── base.repository.ts         # tx-aware abstract CRUD with soft-delete helpers
│   ├── database.module.ts         # @Global — registers every DbRepository + DbService
│   ├── database.service.ts        # Only exposes runInTransaction()
│   ├── extensions/
│   │   └── tenant-scope.extension.ts   # Prisma $extends — injects/asserts companyId
│   ├── companies/                 # CompaniesDbRepository + CompaniesDbService
│   ├── departments/               # DepartmentsDbRepository + DepartmentsDbService
│   ├── tweets/                    # TweetsDbRepository (raw-SQL timeline) + TweetsDbService
│   └── users/                     # UsersDbRepository + UsersDbService (findAuthContext for mock auth)
├── errors/                        # ErrorException + domain error codes (GEN/VAL/AUT/AUZ/DAT/SRV)
├── logger/                        # AppLogger (Pino), sanitizer, trace-context util
├── telemetry/                     # OTel SDK, TelemetryService, @Trace/@InstrumentClass
└── modules/
    ├── departments/               # /api/v1/departments, /departments/tree
    └── tweets/                    # /api/v1/tweets, /api/v1/timeline

prisma/
└── seed.ts                        # 2 companies, 3-level dept tree, 7 users, sample tweets

test/
├── helpers/                       # factories, mock-config, mock-prisma
├── unit/
│   ├── common/{guards,middleware,api-endpoint-decorator.spec.ts,cls.spec.ts}
│   ├── database/{users,companies,departments,tweets,extensions}
│   ├── errors/, logger/
│   └── modules/{departments,tweets}
├── integration/
│   └── acl-matrix.spec.ts         # 13-case visibility matrix against a real Postgres
└── e2e/
    └── tweets.e2e-spec.ts
```

---

## Routing Table

| Task                                                | Load these docs                                                                                                                        |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Understand the product requirements                 | `docs/prd/enterprise-twitter-prd.md`, `QUESTION.md`                                                                                    |
| Understand the tenancy model                        | `docs/guides/FOR-Multi-Tenancy.md`, `README.md` § Multi-Tenant Approach                                                                |
| Work on tweets or the timeline                      | `docs/guides/FOR-Tweets.md`, `docs/diagrams/tweets-sequence.md`                                                                        |
| Work on departments or the hierarchy                | `docs/guides/FOR-Departments.md`, `docs/architecture/database-design.md`                                                               |
| Change database schema                              | `docs/architecture/database-design.md`, `docs/coding-guidelines/06-database-patterns.md`                                               |
| Work on the database layer (DbService/DbRepository) | `docs/guides/FOR-Database-Layer.md`, `docs/coding-guidelines/06-database-patterns.md`, `docs/architecture/service-architecture.md`     |
| Add or fix error handling                           | `docs/guides/FOR-Error-Handling.md`, `docs/coding-guidelines/07-error-handling.md`                                                     |
| Work on mock auth, CLS, or tenant context           | `docs/architecture/mock-auth-flow.md`, `docs/guides/FOR-Multi-Tenancy.md`                                                              |
| Work on logging or tracing                          | `docs/guides/FOR-Observability.md`, `docs/coding-guidelines/08-logging-and-tracing.md`                                                 |
| Write or fix tests                                  | `docs/coding-guidelines/10-testing-standards.md`, `docs/coding-guidelines/11-best-practices-checklist.md`                              |
| Set up infrastructure or deploy                     | `docs/infrastructure/01-docker-setup.md`, `docs/infrastructure/03-deployment-checklist.md`                                             |
| Understand system architecture                      | `docs/architecture/high-level-architecture.md`, `docs/architecture/service-architecture.md`                                            |
| Plan a new feature                                  | `docs/plans/template.md`                                                                                                               |

---

## NestJS DI Rules

- **Same module:** Place providers directly in `providers: []`.
- **Different module:** Export from the providing module and `imports: []` in the consuming module.
- **Globals (`@Global()`):** `AppClsModule`, `AppConfigModule`, `AppLoggerModule`, `PrismaModule`, `DatabaseModule`, `TelemetryModule` — available everywhere without re-importing.
- **Never use `forwardRef`** — restructure dependencies instead (circular deps indicate a design flaw).
- **`APP_GUARD`:** `AuthContextGuard` is registered once in `AppModule`. Routes use `@Public()` to opt out.
- **Middleware order (in `AppModule.configure`):** `RequestId` → `SecurityHeaders` → `MockAuth`. `MockAuth` short-circuits on non-`/api` paths so Swagger and probes stay anonymous.

---

## Coding Conventions

- **No hardcoded strings** — use constants from `src/common/constants/` or `src/common/cls/cls.constants.ts` (`ClsKey` enum).
- **JSDoc on public methods** — document params, return type, and thrown errors.
- **File names:** `kebab-case.type.ts` (e.g., `tweets.service.ts`, `create-tweet.dto.ts`, `tenant-scope.extension.ts`).
- **Classes:** `PascalCase`. **Functions/methods:** `camelCase`. **Constants:** `UPPER_SNAKE_CASE`.
- **Error codes:** `PREFIX` (3 uppercase letters) + 4-digit zero-padded number (e.g., `AUZ0004`, `VAL0008`). Prefix registry: `GEN`, `VAL`, `AUT`, `AUZ`, `DAT`, `SRV`.
- **Imports:** Use path aliases (`@common/`, `@config/`, `@database/`, `@logger/`, `@telemetry/`, `@modules/`, `@errors/`).
- **DTOs:** Zod schemas inside the DTO file; validated via `ZodValidationPipe` at the route level.
- **Never trust `companyId` or `authorId` from the client** — always read from CLS. The tenant-scope extension injects the former on every tenant-scoped op; services read the latter from CLS when creating tweets.

---

## Error System

Errors are represented as `ErrorException` instances (extends `Error`, NOT `HttpException`).
Domain error constants (`GEN`, `VAL`, `AUT`, `AUZ`, `DAT`, `SRV`) are the API — no string keys or factory class.

**Creating errors:**
```typescript
import { AUT, AUZ, DAT, VAL } from '@errors/error-codes';
import { ErrorException } from '@errors/types/error-exception';

// Direct usage — most cases
throw new ErrorException(AUT.UNAUTHENTICATED);
throw new ErrorException(DAT.DEPARTMENT_NOT_FOUND, { message: `Parent ${id} not in this company` });
throw new ErrorException(VAL.DEPARTMENT_NOT_IN_COMPANY);
throw new ErrorException(AUZ.CROSS_TENANT_ACCESS);

// Static helpers for common patterns
throw ErrorException.notFound('Company', id);
throw ErrorException.validation(zodError);       // converts Zod issues
throw ErrorException.validationFromCV(cvErrors);  // converts class-validator
throw ErrorException.internal(cause);
```

**Catching errors:**
```typescript
if (ErrorException.isErrorException(err)) {
  return err.toResponse(); // safe; masks non-userFacing messages
}
const safe = ErrorException.wrap(unknownErr); // always returns an ErrorException
```

**Message masking:** `userFacing` on the error definition controls whether the
message is surfaced to end users. If `userFacing: false` (e.g.
`SRV.INTERNAL_ERROR`, `AUZ.CROSS_TENANT_ACCESS`), the filter masks the message.
There is no separate `isOperational` flag.

**Module-specific error codes** (recent additions):

| Code       | Definition                      | Notes |
|------------|---------------------------------|-------|
| `VAL0007`  | `VAL.DEPARTMENT_IDS_REQUIRED`   | Raised when visibility ≠ COMPANY but departmentIds is empty |
| `VAL0008`  | `VAL.DEPARTMENT_NOT_IN_COMPANY` | Raised when one or more referenced departmentIds are outside the caller's tenant |
| `DAT0009`  | `DAT.DEPARTMENT_NOT_FOUND`      | Parent department not found in this company |
| `DAT0010`  | `DAT.COMPANY_NOT_FOUND`         | Company not found (defensive — guard normally catches) |
| `AUZ0004`  | `AUZ.CROSS_TENANT_ACCESS`       | Raised by the tenant-scope extension on cross-tenant writes |

---

## API Versioning

Routes use **NestJS URI versioning**: `/api/v{version}/path`.

- `main.ts` sets `app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })`.
- Every controller declares its version: `@Controller({ path: 'departments', version: '1' })` or `@Controller({ version: '1' })` (path decided per-route in the tweets controller).
- To add a v2 route, create a new controller with `version: '2'` — v1 continues to work.
- Use `VERSION_NEUTRAL` (from `@nestjs/common`) for routes that should not be versioned.

**Current version:** `v1` (all controllers).

---

## Controller Decorators

Available composite + helper decorators:

| Decorator              | File                                              | Purpose |
|------------------------|---------------------------------------------------|---------|
| `@ApiEndpoint(opts)`   | `src/common/decorators/api-endpoint.decorator.ts` | `@ApiOperation` + `@ApiResponse` + `@HttpCode` combined |
| `@Public()`            | `src/common/decorators/public.decorator.ts`       | Skip `AuthContextGuard` on a route |
| `@CurrentUser(field?)` | `src/common/decorators/current-user.decorator.ts` | Extract `req.user` (populated by `MockAuthMiddleware`) or a specific field |

> Note: `@ApiAuth()` and `@Roles()` were removed when the JWT/API-key stack was
> stripped. Mock-auth is declared on each controller via `@ApiSecurity('x-user-id')`
> (Swagger hint only — the middleware does the work).

---

## Logger Contract

`AppLogger` provides three distinct methods with fixed semantics:

| Method                         | Level                       | Use case |
|--------------------------------|-----------------------------|----------|
| `logEvent(name, opts?)`        | Always INFO                 | Named structured events (lifecycle, domain events) |
| `logError(name, error, opts?)` | Always ERROR                | Caught errors with OTel span recording |
| `log(message, opts?)`          | Configurable (default INFO) | Escape hatch for non-INFO/non-ERROR levels |

**Do not pass `level:` to `logEvent()` or `logError()`.** If you need WARN or FATAL, use `log()`:
```typescript
// Correct
logger.logEvent('tweet.created', { attributes: { tweetId, companyId } });
logger.logError('db.query.failed', error, { attributes: { query } });
logger.log('process exiting', { level: LogLevel.FATAL, attributes: { signal } });

// Wrong — level is ignored on logEvent/logError
logger.logEvent('something.warn', { level: LogLevel.WARN }); // use log() instead
```

**CLS:** Request context (`requestId`, `userId`, `companyId`, `userDepartmentIds`) is propagated via `nestjs-cls`. Services that need request-scoped context inject `ClsService` and read via the `ClsKey` enum.

---

## Testing Guidelines

- **Pattern:** AAA (Arrange / Act / Assert) with explicit comments.
- **Mock factories:** `test/helpers/` (`factories.ts`, `mock-config.ts`, `mock-prisma.ts`).
- **Unit tests:** under `test/unit/**` mirroring the source tree.
- **Integration tests:** `test/integration/**` — use a real Postgres (the ACL matrix is here).
- **E2E tests:** `test/e2e/*.e2e-spec.ts` using `supertest`.
- **Naming:** `describe('<ClassName>')` → `describe('<methodName>')` → `it('should <behaviour when condition>')`.
- **Never call real Prisma** in unit tests — use `mock-prisma.ts`.
- **Coverage:** ≥ 70% global, ≥ 80% on services.
