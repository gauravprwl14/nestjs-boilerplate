# 01 — Project Structure

## Directory Layout

```
src/
├── app.module.ts              # Root module — import order matters (AppClsModule FIRST)
├── main.ts                    # Bootstrap; OTel SDK MUST be initialised before NestJS
├── bootstrap/                 # Graceful shutdown + process signal handlers
├── config/                    # Environment config only; no business logic
│   └── schemas/               # Zod env schema — add new vars here first
├── common/                    # Shared infrastructure — never import from modules/
│   ├── cls/                   # ClsKey enum + AppClsModule (nestjs-cls)
│   ├── constants/             # App constants + route header names
│   ├── decorators/            # Custom parameter/method decorators (@Public, @CurrentUser, @ApiEndpoint)
│   ├── filters/               # AllExceptionsFilter
│   ├── guards/                # AuthContextGuard (registered as APP_GUARD in AppModule)
│   ├── interceptors/          # Transform, logging, timeout interceptors
│   ├── interfaces/            # Shared TypeScript interfaces (ApiResponse, Paginated)
│   ├── middleware/            # RequestId, SecurityHeaders, MockAuth
│   └── pipes/                 # ZodValidationPipe, ParseUuidPipe
├── database/                  # Multi-tier DB layer — raw pg pools, NOT Prisma delegates at runtime
│   ├── prisma/                # schema.prisma + migrations (used for schema only)
│   ├── interfaces/            # PoolConfig, ArchiveDbConfig, DbTier, OrderRow, OrderItemRow, etc.
│   ├── multi-db.service.ts    # pg.Pool manager (primary, replicas, metadata, archive)
│   └── archive-registry.service.ts  # year+tier → pg.Pool routing from archive_databases table
├── errors/                    # ErrorException, domain error-code constants, Prisma error handler
│   ├── error-codes/           # Domain constants: GEN, VAL, AUT, AUZ, DAT, SRV
│   ├── handlers/              # prisma-error.handler.ts (Prisma -> ErrorException mapping)
│   ├── interfaces/            # ErrorCodeDefinition
│   └── types/                 # error-exception.ts
├── logger/                    # AppLogger, logger interfaces, sanitizer util
├── telemetry/                 # OTel SDK init, TelemetryService, decorators
│   └── decorators/            # @Trace, @InstrumentClass, @IncrementCounter, @RecordDuration
└── modules/                   # Feature modules — each is self-contained
    ├── orders/                # Orders API (stub — full impl in feat/om-orders)
    ├── archival/              # Archival pipeline (stub — full impl in feat/om-archival)
    └── mock-data/             # Seed/mock data generation (stub — full impl in feat/om-mock-data)
```

## Rules

**Do** place new feature code under `src/modules/<feature>/`. Each feature
module owns its controller, service, DTOs, and (if async) processor.

**Do** place new shared infrastructure (new pipes, new decorators, new filters,
new middleware) under `src/common/`.

**Do not** create cross-module imports between feature modules. If two feature
modules need shared logic, extract it to `src/common/` or — if it's database
logic — introduce a new `*DbService` under `src/database/`.

**Do not** add business logic to `src/config/` or `src/bootstrap/`. Those
directories contain only setup code.

**Do not** put constants inline in service or controller files. Define them in
`<module>.constants.ts` or `src/common/constants/`.

## Module File Checklist

Every feature module directory should contain:

```
src/modules/<feature>/
├── <feature>.module.ts         # REQUIRED — wires controllers/services
├── <feature>.controller.ts     # REQUIRED — HTTP route handlers
├── <feature>.service.ts        # REQUIRED — business logic
├── dto/                        # REQUIRED — one file per DTO (Zod schema + inferred type)
│   └── create-<feature>.dto.ts
└── <feature>.constants.ts      # Optional — module-local string constants
```

## Test File Placement

- Unit tests: `test/unit/**` mirroring the source tree
- Integration tests: `test/integration/**` (run against a real Postgres)
- E2E tests: `test/e2e/*.e2e-spec.ts`
- Mock helpers: `test/helpers/` (`factories.ts`, `mock-config.ts`, `mock-prisma.ts`)
