# 08 — Logging and Tracing

## AppLogger

Inject `AppLogger` from `@logger/logger.service`. It wraps Pino and adds OTel trace correlation.

```typescript
constructor(private readonly logger: AppLogger) {}
```

Never use `console.log`. Never instantiate Pino directly.

## Logging Methods

```typescript
// Structured event log — use for domain events
this.logger.logEvent('tweet.created', {
  attributes: { tweetId, companyId, authorId, visibility },
});

// Error log — use in exception catch blocks
this.logger.logError('tweets.create.failed', error, {
  attributes: { companyId },
});

// Child logger with persistent context
const childLogger = this.logger.child({ userId, companyId, requestId });
childLogger.logEvent('department.created', { attributes: { departmentId } });
```

## Log Levels

| Level | When to use |
|-------|------------|
| `debug` | Detailed dev-only info (query params, internal state) |
| `info` | Normal operations (request lifecycle, background jobs) |
| `warn` | Expected but notable conditions (deprecated usage, fallback taken) |
| `error` | Unexpected errors, failed operations |

Set via `LOG_LEVEL` env var. Production should use `info` minimum.

## @Trace Decorator

Apply `@Trace()` to service methods that represent meaningful units of work for distributed tracing.
The decorator creates an OTel span around the method execution.

```typescript
@Trace('tweets.create')
async create(dto: CreateTweetDto): Promise<Tweet> {
  // ...
}
```

The span name format is: `<module>.<method>` in kebab-case.

## @InstrumentClass Decorator

Apply `@InstrumentClass()` to an entire service to wrap all public methods with spans automatically.
Use this for services where you want comprehensive tracing without per-method decoration.

```typescript
@Injectable()
@InstrumentClass()
export class DepartmentsService {
  // All public methods get auto-traced
}
```

Do **not** combine `@InstrumentClass` with per-method `@Trace` — you will get duplicate spans.

## @IncrementCounter and @RecordDuration

Use metric decorators for business-level metrics (not request-level, which is auto-instrumented):

```typescript
@IncrementCounter('tweets_created_total')
@RecordDuration('tweets_create_duration_ms')
async create(dto: CreateTweetDto): Promise<Tweet> { ... }
```

## addSpanAttributes

Add business context to the current OTel span for richer trace search:

```typescript
this.telemetry.addSpanAttributes({
  'tweet.id': tweetId,
  'tweet.visibility': dto.visibility,
  'company.id': companyId,
  'user.id': userId,
});
```

Use OTel semantic convention attribute names where they exist.

## Sensitive Data

The logger's `sanitizer.util.ts` strips known sensitive fields (`password`, `passwordHash`, `token`, `keyHash`, `authorization`, `x-user-id`).
Never log raw credentials or tokens even if the sanitizer exists — rely on the sanitizer as a safety net, not the primary defence.
