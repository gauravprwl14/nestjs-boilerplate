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
├── database/              # PrismaService, PrismaModule, BaseRepository
├── errors/                # AppError, ErrorFactory, error-code registry, Prisma error handler
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

| Task | Load these docs |
|------|----------------|
| Add a new feature module | `docs/coding-guidelines/02-module-organization.md`, `docs/coding-guidelines/04-architecture-patterns.md`, `.claude/skills/add-module.md` |
| Modify auth or add a guard | `docs/guides/FOR-Authentication.md`, `docs/architecture/auth-flow.md` |
| Add or change API endpoints | `docs/prd/todo-app-prd.md`, `docs/coding-guidelines/04-architecture-patterns.md`, `docs/guides/FOR-Todo-Module.md` |
| Change database schema | `docs/architecture/database-design.md`, `docs/coding-guidelines/06-database-patterns.md` |
| Add or fix error handling | `docs/guides/FOR-Error-Handling.md`, `docs/coding-guidelines/07-error-handling.md` |
| Work on logging or tracing | `docs/guides/FOR-Observability.md`, `docs/coding-guidelines/08-logging-and-tracing.md` |
| Write or fix tests | `docs/coding-guidelines/10-testing-standards.md`, `docs/coding-guidelines/11-best-practices-checklist.md` |
| Set up infrastructure or deploy | `docs/infrastructure/01-docker-setup.md`, `docs/infrastructure/03-deployment-checklist.md` |
| Understand system architecture | `docs/architecture/high-level-architecture.md`, `docs/architecture/service-architecture.md` |
| Plan a new feature | `docs/plans/template.md`, `PLOT.md` |

---

## NestJS DI Rules

- **Same module:** Place providers directly in `providers: []`.
- **Different module:** Export from the providing module and `imports: []` in the consuming module.
- **Globals (`@Global()`):** `AppConfigModule`, `AppLoggerModule`, `PrismaModule`, `TelemetryModule` — available everywhere without re-importing.
- **Never use `forwardRef`** — restructure dependencies instead (circular deps indicate a design flaw).
- **Guards, interceptors, filters** registered at the module level apply to all routes in that module.

---

## Coding Conventions

- **No hardcoded strings** — use constants from `src/common/constants/` or define a `*.constants.ts` in the module.
- **JSDoc on all public methods** — document params, return type, and thrown errors.
- **File names:** `kebab-case.type.ts` (e.g., `todo-list.service.ts`, `create-todo-list.dto.ts`).
- **Classes:** `PascalCase`.
- **Functions/methods:** `camelCase`.
- **Constants:** `UPPER_SNAKE_CASE`.
- **Error codes:** `PREFIX` (3 uppercase letters) + 4-digit zero-padded unique number (e.g., `DAT0001`, `AUT0006`). Prefix registry: `GEN`, `VAL`, `AUT`, `AUZ`, `DAT`, `SRV`.
- **Imports:** Use path aliases (`@common/`, `@config/`, `@database/`, `@logger/`, `@telemetry/`, `@modules/`).
- **DTOs:** Use Zod schemas inside the DTO file and pass through `ZodValidationPipe`.
- **Never expose `passwordHash`** — use `SafeUser` type from `UsersService`.

---

## Testing Guidelines

- **Pattern:** AAA (Arrange / Act / Assert) with explicit comments.
- **Mock factories:** Place in `test/helpers/` as `create<Entity>Mock()` factory functions.
- **Unit tests:** Co-located `*.spec.ts` next to the source file.
- **E2E tests:** `test/` directory, `*.e2e-spec.ts` suffix.
- **Naming:** `describe('<ClassName>')` → `describe('<methodName>')` → `it('should <behaviour when condition>')`.
- **Never call real databases** in unit tests — mock `PrismaService` via the factory at `test/helpers/prisma.mock.ts`.
- **Coverage:** Service and repository classes must reach ≥ 80% line coverage.
