# AI-Native NestJS Boilerplate — Design Spec

**Date:** 2026-04-15
**Status:** Approved
**Author:** Gaurav Porwal + Claude

---

## 1. Overview

A production-ready, AI-native NestJS boilerplate with a Todo app as the sample domain. Built with the NestJS-idiomatic approach (official `@nestjs/*` packages), latest package versions, comprehensive observability via the Grafana ecosystem, and a 3-layer documentation system for AI-assisted development workflows.

**Goals:**
- Minimal but complete — demonstrates every enterprise pattern without domain bloat
- Clone → `docker compose up` → working app with full observability in Grafana
- AI-native — CLAUDE.md router, custom agents, custom skills, 3-layer docs
- Production-ready patterns — error handling, auth, logging, security, testing

---

## 2. Tech Stack

| Layer | Choice | Package |
|-------|--------|---------|
| Runtime | Node.js 22 LTS | — |
| Framework | NestJS 11 | `@nestjs/core@11`, `@nestjs/common@11` |
| HTTP | Express (NestJS default) | `@nestjs/platform-express@11` |
| Compiler | SWC | `@swc/cli`, `@swc/core` |
| Database | PostgreSQL 16 + Prisma 7 | `@prisma/client@7`, `prisma@7` |
| Cache | Redis 7 via NestJS | `@nestjs/cache-manager`, `cache-manager-redis-yet` |
| Queue | BullMQ via NestJS | `@nestjs/bullmq`, `bullmq` |
| Auth | JWT + API Key | `@nestjs/jwt@11`, `@nestjs/passport@11`, `passport-jwt`, `passport-custom` |
| Validation | class-validator + class-transformer | `class-validator`, `class-transformer` |
| Config | Zod validated | `@nestjs/config@4`, `zod` |
| Logging | Pino | `nestjs-pino`, `pino`, `pino-pretty` |
| Telemetry | OpenTelemetry (direct SDK) | `@opentelemetry/*` |
| Docs | Swagger | `@nestjs/swagger@11` |
| Rate Limit | Throttler | `@nestjs/throttler@6` |
| Health | Terminus | `@nestjs/terminus@11` |
| Schedule | NestJS Schedule | `@nestjs/schedule@4` |
| Testing | Jest + Supertest | `jest`, `ts-jest`, `supertest` |
| Linting | ESLint + Prettier | `eslint`, `prettier`, `@typescript-eslint/*` |
| Git Hooks | Husky + lint-staged + commitlint | `husky`, `lint-staged`, `@commitlint/*` |

**Note:** No `nestjs-otel` — we use `@opentelemetry/*` directly for full control over the telemetry pipeline.

---

## 3. Project Structure

```
ai-native-nestjs-backend/
├── .claude/                                # AI-native workflow
│   ├── settings.json
│   ├── agents/
│   │   ├── code-reviewer.md
│   │   ├── database-engineer.md
│   │   └── api-designer.md
│   └── skills/
│       ├── generate-swagger.md
│       ├── generate-postman.md
│       └── add-module.md
│
├── docs/                                   # 3-layer documentation
│   ├── CONTEXT.md
│   ├── prd/
│   │   ├── CONTEXT.md
│   │   └── todo-app-prd.md
│   ├── architecture/
│   │   ├── CONTEXT.md
│   │   ├── high-level-architecture.md
│   │   ├── service-architecture.md
│   │   ├── database-design.md
│   │   └── auth-flow.md
│   ├── diagrams/
│   │   ├── CONTEXT.md
│   │   ├── auth-sequence.md
│   │   ├── todo-crud-sequence.md
│   │   ├── error-handling-flow.md
│   │   └── observability-pipeline.md
│   ├── coding-guidelines/
│   │   ├── CONTEXT.md
│   │   ├── 01-project-structure.md
│   │   ├── 02-module-organization.md
│   │   ├── 03-file-naming-conventions.md
│   │   ├── 04-architecture-patterns.md
│   │   ├── 05-coding-patterns-and-di.md
│   │   ├── 06-database-patterns.md
│   │   ├── 07-error-handling.md
│   │   ├── 08-logging-and-tracing.md
│   │   ├── 09-development-workflow.md
│   │   ├── 10-testing-standards.md
│   │   └── 11-best-practices-checklist.md
│   ├── infrastructure/
│   │   ├── CONTEXT.md
│   │   ├── 01-docker-setup.md
│   │   ├── 02-environment-configuration.md
│   │   ├── 03-deployment-checklist.md
│   │   └── 04-grafana-stack-setup.md
│   ├── plans/
│   │   ├── CONTEXT.md
│   │   └── template.md
│   ├── assumptions/
│   │   ├── CONTEXT.md
│   │   └── technical-assumptions.md
│   ├── guides/
│   │   ├── CONTEXT.md
│   │   ├── FOR-Authentication.md
│   │   ├── FOR-Error-Handling.md
│   │   ├── FOR-Observability.md
│   │   └── FOR-Todo-Module.md
│   ├── api/
│   │   ├── swagger.json
│   │   └── postman-collection.json
│   └── task-tracker/
│       ├── CONTEXT.md
│       └── project-status.md
│
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
│
├── src/
│   ├── main.ts                             # Bootstrap (split into focused functions)
│   ├── app.module.ts
│   │
│   ├── config/
│   │   ├── config.module.ts                # @Global
│   │   ├── config.service.ts               # Type-safe getters
│   │   └── schemas/
│   │       └── env.schema.ts               # Zod validation
│   │
│   ├── common/
│   │   ├── constants/                      # ALL constants, enums, error codes
│   │   │   ├── app.constants.ts            # API prefix, version, defaults
│   │   │   ├── error-codes.ts              # Domain-prefixed error codes
│   │   │   └── index.ts                    # Barrel export
│   │   ├── decorators/
│   │   │   ├── current-user.decorator.ts
│   │   │   ├── public.decorator.ts
│   │   │   ├── roles.decorator.ts
│   │   │   └── api-auth.decorator.ts       # Swagger auth decorator
│   │   ├── filters/
│   │   │   ├── all-exceptions.filter.ts
│   │   │   └── prisma-exception.filter.ts
│   │   ├── guards/
│   │   │   └── roles.guard.ts
│   │   ├── interceptors/
│   │   │   ├── logging.interceptor.ts
│   │   │   ├── transform.interceptor.ts
│   │   │   └── timeout.interceptor.ts
│   │   ├── middleware/
│   │   │   ├── request-id.middleware.ts
│   │   │   └── security-headers.middleware.ts
│   │   ├── pipes/
│   │   │   ├── zod-validation.pipe.ts
│   │   │   └── parse-uuid.pipe.ts
│   │   └── interfaces/
│   │       ├── api-response.interface.ts   # Standard success/error response
│   │       ├── paginated-result.interface.ts
│   │       └── index.ts
│   │
│   ├── errors/
│   │   ├── error-codes/
│   │   │   └── index.ts                    # GEN, VAL, AUT, AUZ, DAT, SRV
│   │   ├── types/
│   │   │   ├── app-error.ts                # Core error class
│   │   │   └── error-factory.ts            # Static factory methods
│   │   └── handlers/
│   │       └── prisma-error.handler.ts     # Prisma code → AppError
│   │
│   ├── database/
│   │   ├── prisma.module.ts
│   │   ├── prisma.service.ts               # Health checks, connection management
│   │   └── repositories/
│   │       └── base.repository.ts          # Generic CRUD + pagination + soft-delete
│   │
│   ├── logger/
│   │   ├── logger.module.ts
│   │   ├── logger.service.ts               # AppLogger implementing IAppLogger
│   │   ├── logger.config.ts                # Pino config factory
│   │   ├── logger.constants.ts             # Redact paths, PII fields, level mappings
│   │   ├── logger.interfaces.ts            # IAppLogger, ILogOptions, ILogEventOptions, ILogErrorOptions
│   │   └── utils/
│   │       ├── trace-context.util.ts       # W3C, B3, X-Ray extraction + hex validation
│   │       └── sanitizer.util.ts           # Circular ref protection, depth limit
│   │
│   ├── telemetry/
│   │   ├── telemetry.module.ts
│   │   ├── otel-sdk.ts                     # SDK init (traces, metrics, logs)
│   │   ├── otel.constants.ts               # Paths, resource attrs, header names
│   │   ├── telemetry.service.ts            # Span/metric helpers
│   │   ├── decorators/
│   │   │   ├── trace.decorator.ts          # @Trace()
│   │   │   ├── metric.decorator.ts         # @IncrementCounter(), @RecordDuration()
│   │   │   └── instrument-class.decorator.ts # @InstrumentClass()
│   │   └── interfaces/
│   │       └── telemetry.interfaces.ts
│   │
│   ├── cache/
│   │   └── cache.module.ts
│   │
│   ├── queue/
│   │   └── queue.module.ts
│   │
│   ├── bootstrap/
│   │   ├── process-handlers.ts             # Signal + error handlers
│   │   ├── process-handlers.constants.ts   # Exit codes, timeouts, signal names
│   │   └── graceful-shutdown.ts            # NestJS-aware shutdown
│   │
│   └── modules/
│       ├── health/
│       │   ├── health.module.ts
│       │   ├── health.controller.ts        # /health, /health/live, /health/ready
│       │   └── health.service.ts
│       │
│       ├── auth/
│       │   ├── auth.module.ts
│       │   ├── auth.controller.ts
│       │   ├── auth.service.ts
│       │   ├── api-keys.controller.ts
│       │   ├── api-keys.service.ts
│       │   ├── strategies/
│       │   │   ├── jwt.strategy.ts
│       │   │   └── api-key.strategy.ts
│       │   ├── guards/
│       │   │   ├── jwt-auth.guard.ts
│       │   │   ├── api-key-auth.guard.ts
│       │   │   └── combined-auth.guard.ts
│       │   └── dto/
│       │       ├── register.dto.ts
│       │       ├── login.dto.ts
│       │       └── refresh-token.dto.ts
│       │
│       ├── users/
│       │   ├── users.module.ts
│       │   ├── users.controller.ts
│       │   ├── users.service.ts
│       │   ├── users.repository.ts
│       │   └── dto/
│       │       └── update-user.dto.ts
│       │
│       ├── todo-lists/
│       │   ├── todo-lists.module.ts
│       │   ├── todo-lists.controller.ts
│       │   ├── todo-lists.service.ts
│       │   ├── todo-lists.repository.ts
│       │   └── dto/
│       │       ├── create-todo-list.dto.ts
│       │       └── update-todo-list.dto.ts
│       │
│       ├── todo-items/
│       │   ├── todo-items.module.ts
│       │   ├── todo-items.controller.ts
│       │   ├── todo-items.service.ts
│       │   ├── todo-items.repository.ts
│       │   ├── todo-items.processor.ts     # BullMQ (due-date reminders)
│       │   └── dto/
│       │       ├── create-todo-item.dto.ts
│       │       ├── update-todo-item.dto.ts
│       │       └── query-todo-items.dto.ts
│       │
│       └── tags/
│           ├── tags.module.ts
│           ├── tags.controller.ts
│           ├── tags.service.ts
│           ├── tags.repository.ts
│           └── dto/
│               └── create-tag.dto.ts
│
├── test/
│   ├── unit/
│   ├── e2e/
│   ├── load/
│   │   ├── health.k6.ts
│   │   └── todo-crud.k6.ts
│   ├── helpers/
│   └── jest-e2e.json
│
├── docker/
│   ├── Dockerfile                          # Multi-stage (dev, test, prod)
│   └── grafana/
│       ├── provisioning/
│       │   ├── datasources/
│       │   │   └── datasources.yml
│       │   └── dashboards/
│       │       ├── dashboards.yml
│       │       ├── api-overview.json
│       │       └── system-health.json
│       └── otel-collector-config.yml
│
├── docker-compose.yml                      # Dev environment
├── docker-compose.prod.yml                 # Production
├── .env.example
├── .env.development
├── .env.test
├── .eslintrc.js
├── .prettierrc
├── .commitlintrc.js
├── jest.config.js
├── tsconfig.json                           # Path aliases
├── tsconfig.build.json
├── CLAUDE.md                               # Layer 1 router
├── PLOT.md
└── package.json
```

---

## 4. Error Handling System

### 4.1 Error Code Prefixes

| Prefix | Domain | Range |
|--------|--------|-------|
| `GEN` | General | GEN0001 — Rate limited, GEN0002 — Timeout, GEN0003 — Service unavailable |
| `VAL` | Validation | VAL0001 — Invalid input, VAL0002 — Required field, VAL0003 — Field too long, VAL0004 — Invalid status transition |
| `AUT` | Authentication | AUT0001 — Unauthenticated, AUT0002 — Token expired, AUT0003 — Token invalid, AUT0004 — Account suspended, AUT0005 — Account locked |
| `AUZ` | Authorization | AUZ0001 — Forbidden, AUZ0002 — Insufficient permissions, AUZ0003 — Role required |
| `DAT` | Database | DAT0001 — Not found, DAT0002 — Conflict, DAT0003 — Unique violation, DAT0004 — FK violation, DAT0005 — Transaction failed |
| `SRV` | Server/Infra | SRV0001 — Internal error, SRV0002 — Queue error, SRV0003 — Cache error |

### 4.2 AppError Class

- Extends `HttpException`
- Properties: `code`, `message`, `statusCode`, `details`, `cause`, `isOperational`
- Methods: `toLog()` (safe for logging), `toResponse()` (safe for client — includes requestId + traceId)
- Static: `isAppError()` type guard, `wrap()` to wrap unknown errors

### 4.3 ErrorFactory

Static methods: `validation()`, `authentication()`, `authorization()`, `notFound()`, `conflict()`, `uniqueViolation()`, `rateLimited()`, `internal()`, `database()`, `queue()`, `cache()`, `fromZodErrors()`, `fromClassValidatorErrors()`, `fromCode()`

### 4.4 Global Exception Filters

1. **PrismaExceptionFilter** — catches Prisma errors (P2002, P2003, P2025, etc.) → converts to AppError
2. **AllExceptionsFilter** — catches everything else → normalizes to consistent response format

### 4.5 Standard Response Formats

**Success:**
```json
{
  "success": true,
  "data": { "id": "uuid", "title": "My Todo" },
  "meta": {
    "total": 50, "page": 1, "limit": 10,
    "totalPages": 5, "hasNextPage": true, "hasPreviousPage": false,
    "requestId": "uuid", "traceId": "otel-trace-id"
  },
  "timestamp": "2026-04-15T00:00:00.000Z"
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "DAT0001",
    "message": "Todo item not found",
    "details": [{ "field": "id", "message": "No item with this ID" }],
    "requestId": "uuid", "traceId": "otel-trace-id"
  },
  "timestamp": "2026-04-15T00:00:00.000Z"
}
```

---

## 5. Database Schema

### 5.1 Enums

- `UserStatus`: ACTIVE, SUSPENDED, PENDING_VERIFICATION
- `UserRole`: USER, ADMIN
- `ApiKeyStatus`: ACTIVE, REVOKED
- `TodoStatus`: PENDING, IN_PROGRESS, COMPLETED, ARCHIVED
- `TodoPriority`: LOW, MEDIUM, HIGH, URGENT

### 5.2 Models

| Model | Key Fields | Relationships |
|-------|-----------|---------------|
| **User** | email (unique), passwordHash, role, status, lockedUntil, failedLoginCount, deletedAt | → RefreshToken[], ApiKey[], TodoList[] |
| **RefreshToken** | token (unique), userId, expiresAt, revokedAt | → User |
| **ApiKey** | keyHash (unique), prefix, name, userId, status, expiresAt, lastUsedAt | → User |
| **TodoList** | title, description, userId, deletedAt | → User, → TodoItem[] |
| **TodoItem** | title, description, status, priority, dueDate, completedAt, todoListId, deletedAt | → TodoList, → TodoItemTag[] |
| **Tag** | name (unique), color | → TodoItemTag[] |
| **TodoItemTag** | todoItemId, tagId, assignedAt | → TodoItem, → Tag (composite PK) |

### 5.3 Design Decisions

- **Soft delete** on User, TodoList, TodoItem (via `deletedAt`) — BaseRepository filters automatically
- **Explicit join table** `TodoItemTag` (not implicit) — gives us `assignedAt` timestamp
- **Status transitions** enforced in service layer (e.g., ARCHIVED → PENDING blocked)
- **Account lockout** via `lockedUntil` + `failedLoginCount`
- **API Key** stores SHA-256 hash only, prefix for identification
- **Indexes** on FKs and filter columns (status, priority, dueDate)
- **`@@map`** for snake_case PostgreSQL table names

---

## 6. Observability Pipeline

### 6.1 Architecture

```
NestJS App (OTel SDK)
  ├── Traces ──→ OTel Collector ──→ Tempo
  ├── Metrics ──→ OTel Collector ──→ Prometheus
  └── Logs (Pino) ──→ OTel Collector ──→ Loki
                                          ↓
                                     Grafana (auto-provisioned)
                                     ├── Tempo datasource (trace-to-log linked)
                                     ├── Loki datasource (log-to-trace linked)
                                     └── Prometheus datasource
```

### 6.2 OTel SDK Setup (`src/telemetry/otel-sdk.ts`)

- Initialized BEFORE all other imports in `main.ts`
- All constants (paths, resource attributes, header names) in `otel.constants.ts`
- Timeout + retry config on OTLP exporters (configurable via env)
- Lazy instrumentation — not created when `OTEL_ENABLED=false`
- Propagators: W3C TraceContext + B3 (configurable)

### 6.3 Telemetry Decorators

| Decorator | Purpose | Level |
|-----------|---------|-------|
| `@Trace(options?)` | Creates OTel span around a method | Method |
| `@IncrementCounter(options)` | Records counter metric | Method |
| `@RecordDuration(options)` | Records execution time histogram | Method |
| `@InstrumentClass(options?)` | Auto-instruments all public methods with @Trace | Class |

Key design: one decorator per concern (SRP), callback-pattern spans (no double-ending), no verbose logging overhead, `exclude` option for lifecycle methods.

### 6.4 Docker Services (Dev)

| Service | Image | Port |
|---------|-------|------|
| app | Dockerfile (dev) | 3000 |
| postgres | postgres:16-alpine | 5432 |
| redis | redis:7-alpine | 6379 |
| otel-collector | otel/opentelemetry-collector-contrib | 4317, 4318 |
| tempo | grafana/tempo | 3200 |
| loki | grafana/loki | 3100 |
| prometheus | prom/prometheus | 9090 |
| grafana | grafana/grafana | 3001 |

### 6.5 Pre-Provisioned Grafana Dashboards

| Dashboard | Panels |
|-----------|--------|
| API Overview | Request rate, latency p50/p95/p99, error rate by endpoint, status codes |
| System Health | Node.js heap/RSS, event loop lag, active handles, GC pauses |

---

## 7. Logger Service

### 7.1 Core Interface (`IAppLogger`)

```typescript
interface IAppLogger {
  log(message: string, options?: ILogOptions): void;
  logEvent(eventName: string, options?: ILogEventOptions): void;
  logError(eventName: string, error: Error, options?: ILogErrorOptions): void;
  addSpanAttributes(attributes: LogAttributes): void;
  child(context: LogAttributes): IAppLogger;
}
```

### 7.2 Base Options (`ILogOptions`)

| Property | Type | Default | Purpose |
|----------|------|---------|---------|
| `level` | `LogLevel` | Varies by method | Explicit level control |
| `enabled` | `boolean` | `true` | Kill switch — false = zero-cost no-op |
| `attributes` | `LogAttributes` | `undefined` | Structured key-value pairs |
| `spanOnly` | `boolean` | `false` | Attributes to OTel span only (not Pino) |
| `logOnly` | `boolean` | `false` | Attributes to Pino only (not OTel span) |

### 7.3 Type Safety

- `LogAttributeValue = string | number | boolean | string[] | number[]` — no `any`
- `LogAttributes = Record<string, LogAttributeValue>` — strongly typed
- `LogLevel` enum aligned 1:1 with Pino levels and OTel severity numbers

### 7.4 Method Defaults

| Method | Default Level | OTel Behavior |
|--------|--------------|---------------|
| `log()` | INFO | Writes to Pino + adds to active span |
| `logEvent()` | INFO | Adds OTel span event + Pino structured log |
| `logError()` | ERROR | Records exception on span + Pino error log |
| `addSpanAttributes()` | — | Pure span enrichment, no Pino output |

### 7.5 Extended Options

`ILogErrorOptions` adds:
- `recordException?: boolean` (default `true`) — when false, doesn't record on OTel span

### 7.6 Child Loggers

`child(context)` returns a new `AppLogger` instance with merged context. All subsequent logs inherit parent context attributes. No global prototype mutation.

### 7.7 Redaction

All redact paths defined in `logger.constants.ts` (not hardcoded inline):
- `req.headers.authorization`, `req.headers["x-api-key"]`
- `body.password`, `body.passwordHash`, `body.token`, `body.refreshToken`
- `body.ssn`, `body.cardNumber`, `body.cvv`

### 7.8 Serialization Safety

`sanitizer.util.ts` handles:
- Circular reference detection
- Max depth limit (5 levels)
- Error object extraction (message, name, stack)

---

## 8. Security

| Concern | Implementation |
|---------|---------------|
| Helmet | Security headers (X-Frame-Options, CSP, HSTS) |
| CORS | Configurable origins via `CORS_ORIGINS` env |
| Rate limiting | `@nestjs/throttler` — global + per-route |
| Input validation | class-validator whitelist + forbidNonWhitelisted |
| Auth | JWT Bearer + API Key (X-API-Key header) |
| Password hashing | bcrypt with configurable rounds |
| API Key storage | SHA-256 hash, prefix for display only |
| Request ID | Middleware generates/extracts `X-Request-ID` |
| PII redaction | Pino redaction on all log output |
| Env validation | Zod at startup — app refuses to start with invalid config |

---

## 9. Process Handling & Bootstrap

### 9.1 Bootstrap (`main.ts`)

Split into focused functions (SRP):
1. `initOtelSdk()` — must be first, before any imports
2. `createApp()` — NestJS factory
3. `setupSecurity(app)` — Helmet, CORS, rate limiting
4. `setupGlobalPipes(app)` — Validation, transform
5. `setupGlobalFilters(app)` — PrismaExceptionFilter, AllExceptionsFilter
6. `setupGlobalInterceptors(app)` — Logging, Transform, Timeout
7. `setupSwagger(app)` — Swagger docs (non-production only)
8. `setupProcessHandlers(app)` — Signals, errors
9. `startServer(app)` — Listen on configured port

### 9.2 Process Handlers

| Event | Action |
|-------|--------|
| `SIGTERM` | Graceful shutdown → flush telemetry → close DB → exit(0) |
| `SIGINT` | Same as SIGTERM |
| `uncaughtException` | Fatal log + record span → flush → exit(1) |
| `unhandledRejection` | Error log + record span → continue (recoverable) |
| `warning` | Warn log (no exit) |

- Hard exit timeout configurable via `SHUTDOWN_TIMEOUT_MS` env
- NestJS-aware: calls `app.close()` for proper module teardown
- Proper async flush with timeout race (no `.catch(() => {})`)
- All exit codes and timeout values in `process-handlers.constants.ts`

---

## 10. Environment Configuration

### 10.1 .env Files

| File | Purpose |
|------|---------|
| `.env.example` | All vars documented with descriptions + defaults |
| `.env.development` | Dev defaults (local Docker services) |
| `.env.test` | Test overrides (test DB, OTEL_ENABLED=false) |
| `.env.production` | Production template (no defaults for secrets) |

### 10.2 Zod Validation

App refuses to start with missing/invalid env vars. Error messages list every failing field with expected type.

### 10.3 Config Sections

| Section | Key Variables |
|---------|--------------|
| App | `NODE_ENV`, `APP_NAME`, `APP_PORT`, `APP_HOST`, `API_PREFIX`, `API_VERSION`, `LOG_LEVEL` |
| Database | `DATABASE_URL` |
| Redis | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB` |
| Auth | `JWT_ACCESS_SECRET`, `JWT_ACCESS_EXPIRATION`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRATION`, `API_KEY_ENCRYPTION_SECRET`, `BCRYPT_ROUNDS` |
| OTel | `OTEL_ENABLED`, `OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_PROTOCOL` |
| Throttle | `THROTTLE_TTL`, `THROTTLE_LIMIT` |
| CORS | `CORS_ORIGINS` |
| Shutdown | `SHUTDOWN_TIMEOUT_MS` |

---

## 11. Authentication

### 11.1 JWT Flow

- **Register** → hash password, create user, return access + refresh tokens
- **Login** → validate credentials, check account status/lockout, return tokens
- **Refresh** → validate refresh token, check revocation, rotate tokens
- **Change Password** → validate current password, hash new, revoke all refresh tokens

### 11.2 API Key Flow

- **Create** → generate key, hash with SHA-256, store hash + prefix, return full key once
- **Authenticate** → extract from `X-API-Key` header, hash, lookup by hash, validate status/expiry
- **Revoke** → set status to REVOKED

### 11.3 Guards

| Guard | Strategy | Metadata |
|-------|----------|----------|
| `JwtAuthGuard` (global) | Bearer token | Checks `@Public()` to skip |
| `ApiKeyAuthGuard` | X-API-Key header | Used explicitly on routes |
| `CombinedAuthGuard` | JWT or API Key | For routes accepting either |
| `RolesGuard` | Role check | Uses `@Roles()` metadata |

### 11.4 JWT Payload

```typescript
interface JwtPayload {
  sub: string;        // User ID
  email: string;
  role: UserRole;
  type: 'access' | 'refresh';
  jti?: string;       // Unique token ID for rotation blocklist
  iat?: number;
  exp?: number;
}
```

---

## 12. Todo Domain — Business Logic

### 12.1 Status Transitions

```
PENDING → IN_PROGRESS → COMPLETED → ARCHIVED
PENDING → ARCHIVED (skip allowed)
IN_PROGRESS → PENDING (revert allowed)
COMPLETED → IN_PROGRESS (reopen allowed)
ARCHIVED → (terminal, no transitions out)
```

Invalid transitions throw `AppError` with code `VAL0004` (Invalid status transition).

### 12.2 API Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/v1/todo-lists` | Create list | JWT |
| GET | `/api/v1/todo-lists` | Get user's lists (paginated) | JWT |
| GET | `/api/v1/todo-lists/:id` | Get list with items | JWT |
| PATCH | `/api/v1/todo-lists/:id` | Update list | JWT |
| DELETE | `/api/v1/todo-lists/:id` | Soft-delete list | JWT |
| POST | `/api/v1/todo-lists/:listId/items` | Create item | JWT |
| GET | `/api/v1/todo-lists/:listId/items` | Get items (filter by status, priority, tag, dueDate) | JWT |
| GET | `/api/v1/todo-items/:id` | Get single item | JWT |
| PATCH | `/api/v1/todo-items/:id` | Update item (including status transition) | JWT |
| DELETE | `/api/v1/todo-items/:id` | Soft-delete item | JWT |
| POST | `/api/v1/tags` | Create tag | JWT |
| GET | `/api/v1/tags` | List all tags | JWT |
| POST | `/api/v1/todo-items/:id/tags/:tagId` | Assign tag to item | JWT |
| DELETE | `/api/v1/todo-items/:id/tags/:tagId` | Remove tag from item | JWT |

### 12.3 BullMQ Processor

`todo-items.processor.ts` — scheduled job that checks for overdue items and could trigger notifications. Demonstrates:
- Queue producer (service enqueues job on item creation with dueDate)
- Queue consumer (processor picks up jobs)
- `@nestjs/bullmq` decorator pattern

---

## 13. Testing Strategy

### 13.1 Test Types

| Type | Location | Runner | Target |
|------|----------|--------|--------|
| Unit | `test/unit/` | Jest + ts-jest | 70% line coverage |
| E2E | `test/e2e/` | Jest + Supertest | Key API flows |
| Load | `test/load/` | k6 | Baseline benchmarks |

### 13.2 Unit Test Conventions

- AAA pattern with `// --- ARRANGE ---`, `// --- ACT ---`, `// --- ASSERT ---` comments
- Mock factories in `test/helpers/` (reusable across tests)
- One `.spec.ts` per service/controller
- Path aliases work in tests (via `moduleNameMapper`)

### 13.3 E2E Tests

- Docker-based test database (`docker-compose.test.yml`)
- Prisma seed for test data
- Full HTTP lifecycle: request → controller → service → DB → response
- Cleanup after each suite

### 13.4 Load Tests (k6)

- `health.k6.ts` — baseline throughput
- `todo-crud.k6.ts` — CRUD under load
- Output: requests/sec, p95 latency, error rate

---

## 14. AI-Native Workflow

### 14.1 CLAUDE.md (Layer 1 Router)

- Project overview + tech stack
- Folder map with key file locations
- Routing table: task type → which files to load
- NestJS DI rules (same module → providers, different → imports)
- Error code conventions (prefix + 4-digit, unique per scenario)
- Coding conventions: enums not strings, JSDoc on public methods, kebab-case files
- Testing guidelines: AAA pattern, mock factories

### 14.2 3-Layer Documentation

- **Layer 1** — `CLAUDE.md` at root (always loaded)
- **Layer 2** — `CONTEXT.md` in each docs/ subfolder (routing only, <100 lines)
- **Layer 3** — Detailed docs (`FOR-*.md`, numbered guides, PRD, diagrams)

### 14.3 Custom Agents

| Agent | Role |
|-------|------|
| `code-reviewer.md` | Reviews against coding guidelines, error codes, DI patterns |
| `database-engineer.md` | Reviews schema changes, migration safety, indexes |
| `api-designer.md` | Reviews REST conventions, Swagger completeness, DTOs |

### 14.4 Custom Skills

| Skill | Action |
|-------|--------|
| `generate-swagger.md` | Export swagger.json to docs/api/ |
| `generate-postman.md` | Convert swagger → Postman collection |
| `add-module.md` | Scaffold new feature module following all conventions |

### 14.5 PLOT.md

Project planning document tracking: vision, milestones, current focus, decisions log.

---

## 15. Code Quality

### 15.1 ESLint

- `@typescript-eslint/recommended` + `prettier/recommended`
- No `any` (warn), no unused vars (with `_` prefix ignore)
- PascalCase classes, UPPER_SNAKE_CASE enums, camelCase functions

### 15.2 Prettier

- Single quotes, trailing commas, 2-space tabs, 100 char print width, LF line endings

### 15.3 Husky + lint-staged

- Pre-commit: `eslint --fix` + `prettier --write` on staged `.ts` files
- Commit-msg: commitlint with conventional commits (feat, fix, docs, refactor, test, chore)

### 15.4 TSConfig Path Aliases

- `@/*` → `src/*`
- `@config/*` → `src/config/*`
- `@common/*` → `src/common/*`
- `@modules/*` → `src/modules/*`
- `@errors/*` → `src/errors/*`
- `@database/*` → `src/database/*`
- `@logger/*` → `src/logger/*`
- `@telemetry/*` → `src/telemetry/*`

---

## 16. Principles

1. **No hardcoded strings** — all values in constants, enums, or config
2. **Single Responsibility** — one file, one concern
3. **DRY** — shared logic in common/, base classes, utilities
4. **Strongly typed** — no `any`, explicit interfaces for all data structures
5. **JSDoc on public methods** — inline comments for non-obvious logic only
6. **Prescriptive architecture** — one way to do things, documented in coding guidelines
7. **Fail fast** — Zod validates config at startup, not at first use
8. **Observable by default** — every request traced, every error recorded
