# 07 — Error Handling

## Core Principle

Every error thrown in the application **must** be an `ErrorException` instance.
Import domain constants (`GEN`, `VAL`, `AUT`, `AUZ`, `DAT`, `SRV`) from `@errors/error-codes` and pass definitions directly.
Never throw a raw `new Error()` or use string-based error keys.

## ErrorException

`ErrorException` extends `Error` (NOT `HttpException`) and carries:
- `definition` — the full `ErrorCodeDefinition` (single source of truth)
- `code` — domain-prefixed error code (e.g., `DAT0001`)
- `statusCode` — HTTP status (from definition)
- `message` — human-readable message (overridable via options)
- `details` — optional per-field validation details
- `cause` — original error that caused this (preserved in cause chain)

Message masking is controlled by `userFacing` on the definition. If `userFacing: false`, the filter masks the message in API responses. There is no separate `isOperational` flag.

## Creating Errors

```typescript
import { AUT, DAT, VAL, GEN, SRV } from '@errors/error-codes';
import { ErrorException } from '@errors/types/error-exception';

// Direct usage — most cases
throw new ErrorException(DAT.NOT_FOUND, { message: `TodoList ${id} not found` });
throw new ErrorException(VAL.INVALID_STATUS_TRANSITION, { message: `Cannot go from '${from}' to '${to}'` });
throw new ErrorException(AUT.INVALID_CREDENTIALS);
throw new ErrorException(AUT.TOKEN_EXPIRED);
throw new ErrorException(AUT.ACCOUNT_SUSPENDED);

// Static helpers for common parameterized patterns
throw ErrorException.notFound('TodoList', id);
throw ErrorException.validation(zodError);       // converts Zod issues to field details
throw ErrorException.validationFromCV(cvErrors);  // converts class-validator errors
throw ErrorException.internal(cause);             // wraps unexpected errors (SRV.INTERNAL_ERROR)

// Unique constraint with field details
throw new ErrorException(DAT.UNIQUE_VIOLATION, {
  message: 'Email already exists',
  details: [{ field: 'email', message: 'Already registered' }],
});
```

## Error Code Registry

All error codes live in `src/errors/error-codes/` — one file per domain:
- `general.errors.ts` — exports `GEN`
- `validation.errors.ts` — exports `VAL`
- `auth.errors.ts` — exports `AUT`
- `authorization.errors.ts` — exports `AUZ`
- `database.errors.ts` — exports `DAT`
- `server.errors.ts` — exports `SRV`

Adding a new error code:
1. Choose the correct prefix file.
2. Pick the next available 4-digit number in that prefix range.
3. Add the entry with all required `ErrorCodeDefinition` fields.
4. The code reviewer agent will verify uniqueness — run it before merging.

## Exception Filter

The `AllExceptionsFilter` is intentionally thin — it calls `errorException.toResponse(isDevelopment)` and sends the result. Do **not** add mapping logic to the filter.

If a new Prisma error code needs mapping, add it to `src/errors/handlers/prisma-error.handler.ts`.

## Wrapping Unknown Errors

In catch blocks where the error type is unknown, use `ErrorException.wrap()`:

```typescript
try {
  await this.externalService.call();
} catch (err) {
  throw ErrorException.wrap(err); // wraps as SRV0001 if not already ErrorException
}
```

## Cause Chain

`ErrorException` supports a `cause` property. The filter recursively extracts the cause chain:
- In non-production: full chain included in response (code + message per level)
- In production: cause chain omitted from response
- `toLog()` always includes the full chain (up to depth 10)

```typescript
throw new ErrorException(DAT.QUERY_FAILED, {
  message: 'Failed to fetch user',
  cause: originalPrismaError, // preserved in chain
});
```

## Response Shape

All error responses follow:

```json
{
  "success": false,
  "errors": [{
    "code": "VAL0001",
    "message": "Validation failed",
    "errorType": "VALIDATION",
    "errorCategory": "CLIENT",
    "retryable": false,
    "details": [{ "field": "email", "message": "Must be a valid email" }]
  }],
  "requestId": "uuid",
  "traceId": "hex-string",
  "timestamp": "2026-04-15T12:00:00.000Z"
}
```

Never return a different error shape — the frontend relies on this contract.
