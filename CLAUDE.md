# CLAUDE.md — AI Router for order-management backend

## Project Overview

NestJS 11 backend for the Large Order Management take-home assignment
(see `QUESTION.md`).
**Domain:** Orders with multi-tier storage — hot (primary DB + replicas),
warm (metadata/archive DB tier 3), cold (per-year archive databases tier 4).
**Auth:** mocked via `x-user-id` header (JWT + API Key stack has been
stripped).
**Stack:** NestJS 11, Express, Prisma 7 (schema/migrations only — runtime
queries use raw `pg` pools via `MultiDbService`), PostgreSQL 16 (primary +
replicas + metadata + cold-archive pools), Redis (planned), Zod validation,
Pino + nestjs-cls for request-scoped context, OpenTelemetry scaffolding
(disabled by default).

---

## Folder Map

```
src/
├── app.module.ts                  # Root module; wires CLS, config, logger, DB, feature modules (Orders, Archival, MockData)
├── main.ts                        # Bootstrap + Swagger + fallback error handler (OTel is preloaded via side-effect import before NestFactory)
├── bootstrap/                     # Graceful shutdown and process-level signal handlers
├── config/                        # Zod-validated env config; AppConfigService (includes multi-DB + Redis env vars)
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
│   ├── prisma/schema.prisma       # Product/OrderRecent/OrderItemRecent/UserOrderIndex/ArchiveDatabase/PartitionSimulation (schema+migrations only; runtime uses raw pg)
│   ├── prisma/migrations/         # Prisma migration history
│   ├── prisma.service.ts          # PrismaService (used for schema migrations, not runtime queries)
│   ├── database.module.ts         # @Global — registers MultiDbService + ArchiveRegistryService
│   ├── interfaces/index.ts        # PoolConfig, ArchiveDbConfig, DbTier, OrderRow, OrderItemRow, OrderWithItems, UserOrderIndexEntry
│   ├── multi-db.service.ts        # pg.Pool manager: primary (write), replica-1/2 (round-robin reads), metadata (warm), archive pools (cold, lazy)
│   └── archive-registry.service.ts# Loads archive_databases table on startup; year+tier → pg.Pool routing
├── errors/                        # ErrorException + domain error codes (GEN/VAL/AUT/AUZ/DAT/SRV)
├── logger/                        # AppLogger (Pino), sanitizer, trace-context util
├── telemetry/                     # OTel SDK (traces + metrics + logs), TelemetryService, @Trace/@InstrumentClass; `otel-preload.ts` is the side-effect module imported first in main.ts
└── modules/
    ├── orders/                    # Orders feature module (stub — full impl in feat/om-orders)
    ├── archival/                  # Archival feature module (stub — full impl in feat/om-archival)
    └── mock-data/                 # Mock-data seeding module (stub — full impl in feat/om-mock-data)

prisma/
└── seed.ts                        # (legacy seed from enterprise-twitter pivot — may need refresh for order-management schema)

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

| Task                                               | Load these docs                                                                                                                    |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Understand the product requirements                | `docs/prd/enterprise-twitter-prd.md`, `QUESTION.md`                                                                                |
| Understand the tenancy model                       | `docs/guides/FOR-Multi-Tenancy.md`, `README.md` § Multi-Tenant Approach                                                            |
| Work on orders or order retrieval                  | `docs/guides/FOR-Orders.md`, `docs/architecture/database-design.md`                                                                |
| Work on the multi-tier database / archival routing | `docs/guides/FOR-Database-Layer.md`, `docs/architecture/database-design.md`                                                        |
| Work on tweets or the timeline (legacy)            | `docs/guides/FOR-Tweets.md`, `docs/diagrams/tweets-sequence.md`                                                                    |
| Work on departments or the hierarchy (legacy)      | `docs/guides/FOR-Departments.md`, `docs/architecture/database-design.md`                                                           |
| Change database schema                             | `docs/architecture/database-design.md`, `docs/coding-guidelines/06-database-patterns.md`                                           |
| Work on the database layer (MultiDbService/pools)  | `docs/guides/FOR-Database-Layer.md`, `docs/coding-guidelines/06-database-patterns.md`, `docs/architecture/service-architecture.md` |
| Add or fix error handling                          | `docs/guides/FOR-Error-Handling.md`, `docs/coding-guidelines/07-error-handling.md`                                                 |
| Work on mock auth, CLS, or tenant context          | `docs/architecture/mock-auth-flow.md`, `docs/guides/FOR-Multi-Tenancy.md`                                                          |
| Work on logging or tracing                         | `docs/guides/FOR-Observability.md`, `docs/coding-guidelines/08-logging-and-tracing.md`                                             |
| Write or fix tests                                 | `docs/coding-guidelines/10-testing-standards.md`, `docs/coding-guidelines/11-best-practices-checklist.md`                          |
| Set up infrastructure or deploy                    | `docs/infrastructure/01-docker-setup.md`, `docs/infrastructure/03-deployment-checklist.md`                                         |
| Understand system architecture                     | `docs/architecture/high-level-architecture.md`, `docs/architecture/service-architecture.md`                                        |
| Plan a new feature                                 | `docs/plans/template.md`                                                                                                           |

---

## NestJS DI Rules

- **Same module:** Place providers directly in `providers: []`.
- **Different module:** Export from the providing module and `imports: []` in the consuming module.
- **Globals (`@Global()`):** `AppClsModule`, `AppConfigModule`, `AppLoggerModule`, `PrismaModule`, `DatabaseModule`, `TelemetryModule` — available everywhere without re-importing. `DatabaseModule` now exports `MultiDbService` and `ArchiveRegistryService` (not the legacy per-entity DbServices).
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
- **Never trust `userId` or order ownership from the client** — always read from CLS. Services read `userId` from CLS when writing or reading user-scoped data.
- **`AppConfigService.get`** — typed key accessor property (returns a curried function `<K>(key: K): EnvConfig[K]`); used by `MultiDbService` and `ArchiveRegistryService` for dynamic env key reads.

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
throw ErrorException.validation(zodError); // converts Zod issues
throw ErrorException.validationFromCV(cvErrors); // converts class-validator
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

| Code      | Definition                      | Notes                                                                            |
| --------- | ------------------------------- | -------------------------------------------------------------------------------- |
| `VAL0007` | `VAL.DEPARTMENT_IDS_REQUIRED`   | Raised when visibility ≠ COMPANY but departmentIds is empty                      |
| `VAL0008` | `VAL.DEPARTMENT_NOT_IN_COMPANY` | Raised when one or more referenced departmentIds are outside the caller's tenant |
| `DAT0009` | `DAT.DEPARTMENT_NOT_FOUND`      | Parent department not found in this company                                      |
| `DAT0010` | `DAT.COMPANY_NOT_FOUND`         | Company not found (defensive — guard normally catches)                           |
| `AUZ0004` | `AUZ.CROSS_TENANT_ACCESS`       | Raised by the tenant-scope extension on cross-tenant writes                      |

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

| Decorator              | File                                              | Purpose                                                                    |
| ---------------------- | ------------------------------------------------- | -------------------------------------------------------------------------- |
| `@ApiEndpoint(opts)`   | `src/common/decorators/api-endpoint.decorator.ts` | `@ApiOperation` + `@ApiResponse` + `@HttpCode` combined                    |
| `@Public()`            | `src/common/decorators/public.decorator.ts`       | Skip `AuthContextGuard` on a route                                         |
| `@CurrentUser(field?)` | `src/common/decorators/current-user.decorator.ts` | Extract `req.user` (populated by `MockAuthMiddleware`) or a specific field |

> Note: `@ApiAuth()` and `@Roles()` were removed when the JWT/API-key stack was
> stripped. Mock-auth is declared on each controller via `@ApiSecurity('x-user-id')`
> (Swagger hint only — the middleware does the work).

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
