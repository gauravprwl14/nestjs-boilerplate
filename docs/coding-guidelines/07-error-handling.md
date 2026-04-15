# 07 — Error Handling

## Core Principle

Every error thrown in the application **must** be an `AppError` instance.
Use `ErrorFactory` for all standard error scenarios.
Never throw a raw `new Error()` or an HTTP exception from NestJS directly.

## AppError

`AppError` extends `HttpException` and carries:
- `code` — domain-prefixed error code (e.g., `DAT0001`)
- `statusCode` — HTTP status
- `message` — human-readable message
- `details` — optional per-field validation details
- `isOperational` — `true` means expected/handled; `false` means unexpected (message is masked in response)

## ErrorFactory Usage

```typescript
// Resource not found
throw ErrorFactory.notFound('TodoList', id);

// Validation failure
throw ErrorFactory.validation('Title is required', [{ field: 'title', message: 'Required' }]);

// Invalid status transition
throw ErrorFactory.invalidStatusTransition('PENDING', 'COMPLETED');

// Authentication
throw ErrorFactory.invalidCredentials();
throw ErrorFactory.tokenExpired();

// Authorization
throw ErrorFactory.authorization('You do not own this resource');

// Unique constraint (usually caught by PrismaExceptionFilter)
throw ErrorFactory.uniqueViolation('email');

// Unexpected internal error (message will be masked)
throw ErrorFactory.internal(cause);
```

## Error Code Registry

All error codes live in `src/common/constants/error-codes.ts`.

Adding a new error code:
1. Choose the correct prefix (`GEN`, `VAL`, `AUT`, `AUZ`, `DAT`, `SRV`).
2. Pick the next available 4-digit number in that prefix range.
3. Add the entry: `PREFIX####: { code: 'PREFIX####', message: '...', statusCode: NNN }`.
4. The code reviewer agent will verify uniqueness — run it before merging.

```typescript
// Example: adding a new validation code
VAL0005: { code: 'VAL0005', message: 'Date must be in the future', statusCode: 400 },
```

## Exception Filters

Do **not** modify `AllExceptionsFilter` or `PrismaExceptionFilter` for feature-specific handling.
If a new Prisma error code needs mapping, add it to `src/errors/handlers/prisma-error.handler.ts`.

## Wrapping Unknown Errors

In catch blocks where the error type is unknown, use `AppError.wrap()`:

```typescript
try {
  await this.externalService.call();
} catch (err) {
  throw AppError.wrap(err); // wraps as SRV0001 if not already AppError
}
```

## Non-Operational Errors

Set `isOperational: false` for errors where the message contains internal details
that should never be exposed to clients:

```typescript
throw ErrorFactory.internal(cause);
// Response will return: "Internal server error" (masked message from ERROR_CODES.SRV0001)
```

## Response Shape

All error responses follow:

```json
{
  "success": false,
  "error": {
    "code": "VAL0001",
    "message": "Validation failed",
    "details": [{ "field": "email", "message": "Must be a valid email" }],
    "requestId": "uuid",
    "traceId": "hex-string"
  }
}
```

Never return a different error shape — the frontend relies on this contract.
