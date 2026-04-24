# Service Architecture — NestJS Module Graph

<!-- DOC-SYNC: Diagram updated on 2026-04-25 for the Order Management pivot (feat/observability). Departments + Tweets modules replaced by Orders + Archival + MockData stubs. DatabaseModule now provides MultiDbService + ArchiveRegistryService instead of per-entity DbServices. Please verify visual accuracy before committing. -->

## Module Import Graph

```mermaid
graph TD
    AppModule["AppModule\n(root)"]

    AppClsModule["AppClsModule\n@Global — nestjs-cls AsyncLocalStorage"]
    AppConfigModule["AppConfigModule\n@Global — config, env vars"]
    AppLoggerModule["AppLoggerModule\n@Global — AppLogger / Pino"]
    PrismaModule["PrismaModule\n@Global — PrismaService (migrations only)"]
    DatabaseModule["DatabaseModule\n@Global\n+ MultiDbService + ArchiveRegistryService"]
    TelemetryModule["TelemetryModule\n@Global — TelemetryService"]

    OrdersModule["OrdersModule\n(stub — feat/om-orders)"]
    ArchivalModule["ArchivalModule\n(stub — feat/om-archival)"]
    MockDataModule["MockDataModule\n(stub — feat/om-mock-data)"]

    AppModule --> AppClsModule
    AppModule --> AppConfigModule
    AppModule --> AppLoggerModule
    AppModule --> DatabaseModule
    AppModule --> TelemetryModule
    AppModule --> OrdersModule
    AppModule --> ArchivalModule
    AppModule --> MockDataModule

    DatabaseModule --> PrismaModule
    AppModule -.->|"APP_GUARD\nAuthContextGuard"| AppModule
```

## Global Modules

Global modules are registered once in `AppModule` and inject into any module without explicit import:

| Module            | Provides                                                               |
| ----------------- | ---------------------------------------------------------------------- |
| `AppClsModule`    | `nestjs-cls` ClsService + middleware registration                      |
| `AppConfigModule` | `AppConfigService` (incl. typed `.get` accessor for multi-DB env vars) |
| `AppLoggerModule` | `AppLogger`                                                            |
| `PrismaModule`    | `PrismaService` (for migrations only — not used for runtime queries)   |
| `DatabaseModule`  | `MultiDbService`, `ArchiveRegistryService`                             |
| `TelemetryModule` | `TelemetryService`, `@Trace`, `@InstrumentClass`                       |

## Module Responsibilities

| Module           | Controller(s) | Service(s)                                 | Key Providers                                              |
| ---------------- | ------------- | ------------------------------------------ | ---------------------------------------------------------- |
| `OrdersModule`   | (stub)        | (stub)                                     | — (full impl in feat/om-orders)                            |
| `ArchivalModule` | (stub)        | (stub)                                     | — (full impl in feat/om-archival)                          |
| `MockDataModule` | (stub)        | (stub)                                     | — (full impl in feat/om-mock-data)                         |
| `DatabaseModule` | —             | `MultiDbService`, `ArchiveRegistryService` | `pg.Pool` instances (primary, replicas, metadata, archive) |

## Middleware & Cross-Cutting Pipeline

```
Request
  → RequestIdMiddleware        (inject x-request-id)
  → SecurityHeadersMiddleware  (Helmet headers)
  → MockAuthMiddleware         (x-user-id → findAuthContext → set CLS tuple)
  → AuthContextGuard (APP_GUARD)  (require companyId in CLS; @Public() opt-out)
  → ZodValidationPipe          (per-route DTO validation)
  → Controller Handler
  → LoggingInterceptor         (log request + response duration)
  → TransformInterceptor       (wrap in { success, data })
  → TimeoutInterceptor         (abort if > configurable timeout)
Response
```

Exception path:

```
Thrown error
  → AllExceptionsFilter        (catches everything; thin filter)
     → handlePrismaError()     (maps Prisma errors → ErrorException with cause)
     → ErrorException.wrap()   (wraps unknown errors as SRV0001)
  → errorException.toResponse(includeChain) → structured JSON response
```

Fallback Express error handler registered AFTER `app.listen()` in `main.ts`
catches any 404s from the router layer that escape NestJS's filter chain (e.g.,
intercepted by OTel Express instrumentation).
