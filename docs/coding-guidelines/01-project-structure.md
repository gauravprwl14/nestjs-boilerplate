# 01 — Project Structure

## Directory Layout

```
src/
├── app.module.ts              # Root module — import order matters (globals first)
├── main.ts                    # Bootstrap; OTel SDK MUST be initialised before NestJS
├── bootstrap/                 # Graceful shutdown + process signal handlers
├── config/                    # Environment config only; no business logic
│   └── schemas/               # Zod env schema — add new vars here first
├── common/                    # Shared infrastructure — never import from modules/
│   ├── constants/             # App constants + error codes registry
│   ├── decorators/            # Custom parameter and method decorators
│   ├── filters/               # Exception filters (AllExceptions, Prisma)
│   ├── interceptors/          # Transform, logging, timeout interceptors
│   ├── interfaces/            # Shared TypeScript interfaces (ApiResponse, Paginated)
│   ├── middleware/            # RequestId, SecurityHeaders
│   └── pipes/                 # ZodValidationPipe, ParseUuidPipe
├── database/                  # PrismaService, PrismaModule, BaseRepository
├── errors/                    # AppError, ErrorFactory, error-codes re-export
│   ├── error-codes/           # Re-exports from common/constants/error-codes.ts
│   ├── handlers/              # prisma-error.handler.ts (Prisma → AppError mapping)
│   └── types/                 # app-error.ts, error-factory.ts
├── logger/                    # AppLogger, logger interfaces, sanitizer util
├── telemetry/                 # OTel SDK init, TelemetryService, decorators
│   └── decorators/            # @Trace, @InstrumentClass, @IncrementCounter, @RecordDuration
├── queue/                     # QueueModule — BullMQ Redis connection only
└── modules/                   # Feature modules — each is self-contained
    ├── auth/
    ├── health/
    ├── tags/
    ├── todo-items/
    ├── todo-lists/
    └── users/
```

## Rules

**Do** place new feature code under `src/modules/<feature>/`. Each feature module owns its controller, service, DTOs, and processor (if async).

**Do** place new shared infrastructure (new pipes, new decorators, new filters) under `src/common/`.

**Do not** create cross-module imports between feature modules. If two feature modules need shared logic, extract it to `src/common/` or a dedicated shared module.

**Do not** add business logic to `src/config/` or `src/bootstrap/`. Those directories contain only setup code.

**Do not** put constants inline in service or controller files. Define them in `<module>.constants.ts` or `src/common/constants/`.

## Module File Checklist

Every feature module directory should contain:

```
src/modules/<feature>/
├── <feature>.module.ts         # REQUIRED — wires providers and imports
├── <feature>.controller.ts     # REQUIRED — HTTP route handlers
├── <feature>.service.ts        # REQUIRED — business logic
├── dto/                        # REQUIRED — one file per DTO
│   ├── create-<feature>.dto.ts
│   └── update-<feature>.dto.ts
├── <feature>.constants.ts      # Optional — module-local string constants
└── <feature>.processor.ts      # Optional — BullMQ processor
```

## Test File Placement

- Unit tests: `src/modules/<feature>/<file>.spec.ts` (co-located)
- E2E tests: `test/<feature>.e2e-spec.ts`
- Mock helpers: `test/helpers/<entity>.mock.ts`
