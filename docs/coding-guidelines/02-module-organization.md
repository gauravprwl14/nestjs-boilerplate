# 02 — Module Organization

## Module Anatomy

Every feature module follows this exact structure:

```typescript
// src/modules/example/example.module.ts
@Module({
  imports: [
    // Only import modules that export services you need
    // Never import globals (PrismaModule, AppLoggerModule, etc.) — they are auto-available
  ],
  controllers: [ExampleController],
  providers: [
    ExampleService,
    // Note: *DbRepository and *DbService live in src/database/ and are provided
    // by the global DatabaseModule — do NOT redeclare them here.
  ],
  exports: [
    ExampleService, // only export if another module needs this service
  ],
})
export class ExampleModule {}
```

## DI Import Rules

| Scenario                                   | What to do                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| Need `PrismaService` (infrastructure only) | Inject directly — `PrismaModule` is `@Global()`                            |
| Need data access (pools)                   | Inject `MultiDbService` directly — `DatabaseModule` is `@Global()`         |
| Need archive pool routing                  | Inject `ArchiveRegistryService` directly — `DatabaseModule` is `@Global()` |
| Need aggregate-level DB ops                | Inject the `*DbService` directly — `DatabaseModule` is `@Global()`         |
| Need `AppLogger`                           | Inject directly — `AppLoggerModule` is `@Global()`                         |
| Need `TelemetryService`                    | Inject directly — `TelemetryModule` is `@Global()`                         |
| Need `AppConfigService`                    | Inject directly — `AppConfigModule` is `@Global()`                         |
| Need a service from another feature module | Add that module to `imports: []` and ensure it `exports` the service       |
| Two modules depend on each other           | This is a circular dependency — refactor shared logic to `common/`         |

## Provider Registration Patterns

### Standard service

```typescript
providers: [ExampleService];
```

### With factory (conditional config)

```typescript
providers: [
  {
    provide: EXAMPLE_TOKEN,
    useFactory: (config: AppConfigService) => new ExampleService(config.someValue),
    inject: [AppConfigService],
  },
];
```

### Alias token for an existing class

```typescript
providers: [ExampleService, { provide: EXAMPLE_SERVICE_TOKEN, useExisting: ExampleService }];
```

## Global Guard Registration

The `AuthContextGuard` is registered as a global guard in `AppModule`:

```typescript
providers: [{ provide: APP_GUARD, useClass: AuthContextGuard }];
```

It verifies that `userId` is present in CLS (populated by
`MockAuthMiddleware`). Routes that must stay anonymous (Swagger, liveness
probes) mark themselves with `@Public()`.

Do **not** register additional `APP_GUARD` providers unless intentional — each
one runs on every request.

## Async / Queue Processing

This build does not ship a queue. The previous BullMQ + Redis `QueueModule`
has been removed from `src/` because the current assignment has no async-job
requirement. If a future feature needs one:

1. Reintroduce `QueueModule` under `src/queue/` with a BullMQ connection.
2. Register the queue in the consuming feature module via
   `BullModule.registerQueue({ name: QUEUE_NAME })`.
3. Add the `@Processor(QUEUE_NAME)` class as a provider in the same module.

## Exporting Services

Only export a service if it is consumed by another module.
Exporting everything pollutes the module API and makes refactoring harder.

```typescript
// Bad — exposes internals unnecessarily
exports: [ExampleService, ExampleRepository, ExampleHelper];

// Good — only expose what other modules legitimately need
exports: [ExampleService];
```
