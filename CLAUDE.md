# CLAUDE.md — AI Router for large-order-management backend

## Project Overview

Production-grade e-commerce order archival system built on NestJS 11
(see `Question-2.md` for the full spec).
**Domain:** E-commerce order archival — Hot/Warm/Cold tiers across 7 Postgres
instances (primary + 2 read replicas + metadata-archive + 3 cold archives).
**Auth:** `x-user-id` header as a positive integer — no DB lookup.
**Stack:** NestJS 11, Express, raw `pg` pools (Prisma kept for migrations only),
PostgreSQL 16 (primary + 2 replicas + 5 archive DBs), Redis (ioredis),
Pino + nestjs-cls for request-scoped context, OpenTelemetry scaffolding.
**Container runtime:** Podman + podman-compose. Run with: `podman-compose up -d`

---

## Folder Map

```
src/
├── app.module.ts                  # Root module; wires CLS, config, logger, DB, feature modules
├── main.ts                        # Bootstrap + Swagger + fallback error handler (OTel is preloaded via side-effect import before NestFactory)
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
│   ├── prisma/schema.prisma       # Prisma schema (used for migrations only; runtime uses raw pg)
│   ├── prisma/migrations/         # Managed by Prisma Migrate
│   ├── multi-db.service.ts        # @Global — pg Pool manager: primary, replicas, metadata, cold archives
│   ├── database.module.ts         # @Global — registers MultiDbService + DbService
│   ├── database.service.ts        # runInTransaction() helper (primary pool only)
│   └── interfaces/index.ts        # PoolConfig, ArchiveDbConfig, OrderRow, DbTier, …
├── errors/                        # ErrorException + domain error codes (GEN/VAL/AUT/AUZ/DAT/SRV)
├── logger/                        # AppLogger (Pino), sanitizer, trace-context util
├── telemetry/                     # OTel SDK (traces + metrics + logs), TelemetryService, @Trace/@InstrumentClass; `otel-preload.ts` is the side-effect module imported first in main.ts
└── modules/
    ├── orders/                    # /api/v1/orders, /api/v1/orders/user/:userId (multi-tier read)
    ├── archival/                  # /admin/archival/stats, /database-sizes, /archive-for-year/:year
    └── mock-data/                 # /mock-data/generate, /mock-data/status

prisma/
└── seed.ts                        # Seed via generate_series SQL — runs automatically at container first-start (~5 min for ~3M orders)

test/
├── helpers/                       # factories, mock-config, mock-pg
├── unit/
│   ├── common/{guards,middleware}
│   ├── database/
│   ├── errors/, logger/
│   └── modules/{orders,archival,mock-data}
├── integration/
│   └── multi-tier-routing.spec.ts # tier routing against real Postgres
├── e2e/
│   └── orders.e2e-spec.ts
└── k6/
    ├── read-orders.js             # 20→100 VUs, 3 min; p95<200ms
    ├── create-orders.js           # 10→20 VUs, 2 min; p95<300ms
    └── archival-stats.js          # 5 VUs, 1.5 min; p95<1000ms
```

---

## Routing Table

| Task                                              | Load these docs                                                                                                                   |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Understand the product requirements               | `Question-2.md`, `docs/superpowers/plans/2026-04-25-order-management.md`                                                          |
| Work on orders or multi-tier querying             | `src/modules/orders/`, `src/database/multi-db.service.ts`                                                                         |
| Work on archival or partition rotation            | `src/modules/archival/`, `docs/coding-guidelines/06-database-patterns.md`                                                         |
| Work on mock data generation                      | `src/modules/mock-data/`, `prisma/seed.ts`                                                                                        |
| Change database schema                            | `docs/architecture/database-design.md`, `docs/coding-guidelines/06-database-patterns.md`                                          |
| Work on the database layer (MultiDbService/pools) | `src/database/multi-db.service.ts`, `docs/coding-guidelines/06-database-patterns.md`, `docs/architecture/service-architecture.md` |
| Add or fix error handling                         | `docs/guides/FOR-Error-Handling.md`, `docs/coding-guidelines/07-error-handling.md`                                                |
| Work on auth or CLS context                       | `src/common/middleware/mock-auth.middleware.ts`, `src/common/guards/auth-context.guard.ts`                                        |
| Work on logging or tracing                        | `docs/guides/FOR-Observability.md`, `docs/coding-guidelines/08-logging-and-tracing.md`                                            |
| Write or fix tests                                | `docs/coding-guidelines/10-testing-standards.md`, `docs/coding-guidelines/11-best-practices-checklist.md`                         |
| Run k6 load tests                                 | `test/k6/read-orders.js`, `test/k6/create-orders.js`, `test/k6/archival-stats.js`                                                 |
| Set up infrastructure or deploy                   | `docker-compose.yml`, `docs/infrastructure/01-docker-setup.md`, `docs/infrastructure/03-deployment-checklist.md`                  |
| Understand system architecture                    | `docs/architecture/high-level-architecture.md`, `docs/architecture/service-architecture.md`                                       |
| Plan a new feature                                | `docs/plans/template.md`                                                                                                          |

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
- **JSDoc on ALL exported code** — every exported class, method, interface, type alias, and enum member must have a JSDoc block. Use `/** ... */` format. Document params with `@param`, return value with `@returns`, thrown errors with `@throws`. Inside method bodies, use `//` inline comments only for non-obvious WHY (hidden constraint, workaround, subtle invariant) — never for restating WHAT the code does. New files without JSDoc on public API will be rejected in review.
- **File names:** `kebab-case.type.ts` (e.g., `tweets.service.ts`, `create-tweet.dto.ts`, `tenant-scope.extension.ts`).
- **Classes:** `PascalCase`. **Functions/methods:** `camelCase`. **Constants:** `UPPER_SNAKE_CASE`.
- **Error codes:** `PREFIX` (3 uppercase letters) + 4-digit zero-padded number (e.g., `AUZ0004`, `VAL0008`). Prefix registry: `GEN`, `VAL`, `AUT`, `AUZ`, `DAT`, `SRV`.
- **Imports:** Use path aliases (`@common/`, `@config/`, `@database/`, `@logger/`, `@telemetry/`, `@modules/`, `@errors/`).
- **DTOs:** Zod schemas inside the DTO file; validated via `ZodValidationPipe` at the route level.
- **Never trust `userId` from the request body** — always read from CLS (`ClsKey.USER_ID`). The `MockAuthMiddleware` validates and stores it; services read it from CLS when creating orders.

---

## JSDoc Examples

**Class:**

```typescript
/**
 * DB-layer façade over OrdersDbRepository.
 * Feature services inject this — repositories are an implementation detail.
 */
@Injectable()
export class OrdersDbService { ... }
```

**Method:**

```typescript
/**
 * Round-robin across replica-1 and replica-2.
 * Falls back to primary when replica pool list is empty.
 *
 * @returns A read-only pg.Pool — do not use for writes
 */
getReadPool(): Pool { ... }
```

**Interface property:**

```typescript
export interface Order {
  /** 2=hot (primary+replicas), 3=warm (metadata archive), 4=cold (year archive) */
  tier: 2 | 3 | 4;
}
```

---

## JSDoc Examples

**Class:**

```typescript
/**
 * DB-layer façade over OrdersDbRepository.
 * Feature services inject this — repositories are an implementation detail.
 */
@Injectable()
export class OrdersDbService { ... }
```

**Method:**

```typescript
/**
 * Round-robin across replica-1 and replica-2.
 * Falls back to primary when replica pool list is empty.
 *
 * @returns A read-only pg.Pool — do not use for writes
 */
getReadPool(): Pool { ... }
```

**Interface property:**

```typescript
export interface Order {
  /** 2=hot (primary+replicas), 3=warm (metadata archive), 4=cold (year archive) */
  tier: 2 | 3 | 4;
}
```

---

## Error System

Errors are represented as `ErrorException` instances (extends `Error`, NOT `HttpException`).
Domain error constants (`GEN`, `VAL`, `AUT`, `AUZ`, `DAT`, `SRV`) are the API — no string keys or factory class.

**Creating errors:**

```typescript
import { AUT, DAT, VAL } from '@errors/error-codes';
import { ErrorException } from '@errors/types/error-exception';

// Direct usage — most cases
throw new ErrorException(AUT.UNAUTHENTICATED);
throw new ErrorException(DAT.NOT_FOUND, { message: `Order ${orderId} not found` });
throw new ErrorException(DAT.ARCHIVE_NOT_FOUND, { message: `No archive for year ${year}` });

// Static helpers for common patterns
throw ErrorException.notFound('Order', orderId.toString());
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
`SRV.INTERNAL_ERROR`), the filter masks the message.
There is no separate `isOperational` flag.

**Module-specific error codes** (recent additions):

| Code      | Definition              | Notes                                                     |
| --------- | ----------------------- | --------------------------------------------------------- |
| `VAL0001` | `VAL.VALIDATION_FAILED` | Generic Zod/request validation failure                    |
| `AUT0001` | `AUT.UNAUTHENTICATED`   | Missing or invalid `x-user-id` header                     |
| `DAT0001` | `DAT.NOT_FOUND`         | Generic resource not found (orders, archive entries, etc) |
| `DAT0010` | `DAT.COMPANY_NOT_FOUND` | Company not found — defensive guard                       |
| `SRV0001` | `SRV.INTERNAL_ERROR`    | Unhandled / unexpected server error                       |

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
logger.logEvent('order.created', { attributes: { orderId, userId } });
logger.logError('db.query.failed', error, { attributes: { query } });
logger.log('process exiting', { level: LogLevel.FATAL, attributes: { signal } });

// Wrong — level is ignored on logEvent/logError
logger.logEvent('something.warn', { level: LogLevel.WARN }); // use log() instead
```

**CLS:** Request context (`requestId`, `userId`, `traceId`) is propagated via `nestjs-cls`. Services that need request-scoped context inject `ClsService` and read via the `ClsKey` enum.

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
