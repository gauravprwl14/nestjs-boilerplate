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
    ExampleRepository, // if you have a dedicated repository class
  ],
  exports: [
    ExampleService, // only export if another module needs this service
  ],
})
export class ExampleModule {}
```

## DI Import Rules

| Scenario | What to do |
|----------|-----------|
| Need `PrismaService` | Inject directly — `PrismaModule` is `@Global()` |
| Need `AppLogger` | Inject directly — `AppLoggerModule` is `@Global()` |
| Need `TelemetryService` | Inject directly — `TelemetryModule` is `@Global()` |
| Need `AppConfigService` | Inject directly — `AppConfigModule` is `@Global()` |
| Need a service from another feature module | Add that module to `imports: []` and ensure it `exports` the service |
| Two modules depend on each other | This is a circular dependency — refactor shared logic to `common/` |

## Provider Registration Patterns

### Standard service

```typescript
providers: [ExampleService]
```

### With factory (conditional config)

```typescript
providers: [
  {
    provide: EXAMPLE_TOKEN,
    useFactory: (config: AppConfigService) => new ExampleService(config.someValue),
    inject: [AppConfigService],
  },
]
```

### Alias token for an existing class

```typescript
providers: [
  ExampleService,
  { provide: EXAMPLE_SERVICE_TOKEN, useExisting: ExampleService },
]
```

## Global Guard Registration

The `JwtAuthGuard` is registered as a global guard in `AuthModule`:

```typescript
providers: [
  { provide: APP_GUARD, useClass: JwtAuthGuard },
]
```

Do **not** register additional `APP_GUARD` providers unless intentional — each one runs on every request.

## BullMQ Processor Registration

Processors must be registered both as a provider and linked to a queue name:

```typescript
// In the feature module:
imports: [
  QueueModule, // imports BullMQ Redis connection
  BullModule.registerQueue({ name: QUEUE_NAME }),
],
providers: [
  ExampleService,
  ExampleProcessor, // decorated with @Processor(QUEUE_NAME)
],
```

## Exporting Services

Only export a service if it is consumed by another module.
Exporting everything pollutes the module API and makes refactoring harder.

```typescript
// Bad — exposes internals unnecessarily
exports: [ExampleService, ExampleRepository, ExampleHelper]

// Good — only expose what other modules legitimately need
exports: [ExampleService]
```
