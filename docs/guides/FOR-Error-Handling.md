# FOR-Error-Handling.md — Error Handling Feature Guide

> Related: `docs/diagrams/error-handling-flow.md`, `docs/coding-guidelines/07-error-handling.md`

---

## 1. Business Use Case

Every API client needs a predictable error format to build reliable UIs and automated integrations.
The error handling system guarantees:
- Every error returns the same JSON shape with a machine-readable `code`.
- Internal errors (bugs, infra failures) have their messages masked so stack traces never reach clients.
- Prisma constraint violations are automatically translated to meaningful error codes.
- All errors are logged with full context (traceId, requestId, stack) for debugging.

---

## 2. Flow Diagram

See `docs/diagrams/error-handling-flow.md` for the full mermaid flowchart.

```
throw (anywhere in app)
  → PrismaExceptionFilter  (if Prisma error — map to AppError)
  → AllExceptionsFilter    (always runs — map to structured response)
  → { success: false, error: { code, message, details?, requestId, traceId } }
```

---

## 3. Code Structure

```
src/errors/
├── types/
│   ├── app-error.ts         # AppError class — extends HttpException
│   └── error-factory.ts     # ErrorFactory — convenience constructors for all domain errors
├── error-codes/
│   └── index.ts             # Re-exports ERROR_CODES from common/constants
└── handlers/
    └── prisma-error.handler.ts  # Maps Prisma error codes to AppError instances

src/common/
├── constants/
│   └── error-codes.ts       # SOURCE OF TRUTH — all ERROR_CODES registry
├── filters/
│   ├── all-exceptions.filter.ts    # @Catch() — catches everything
│   └── prisma-exception.filter.ts  # @Catch(PrismaClientKnownRequestError)
└── interfaces/
    └── api-response.interface.ts   # ApiResponse<T>, ApiErrorDetail shapes
```

---

## 4. Key Methods

### AppError

| Method/Property | Purpose |
|-----------------|---------|
| `AppError.fromCode(key, overrides?)` | Create AppError from ERROR_CODES registry entry |
| `AppError.wrap(unknown)` | Wrap any unknown error; returns AppError as-is or wraps as SRV0001 |
| `AppError.isAppError(val)` | Type guard |
| `error.toLog()` | Returns plain object with full context for logging |
| `error.toResponse(requestId?, traceId?)` | Returns `ApiErrorDetail` for HTTP response |
| `error.isOperational` | `true` = expected error; `false` = message masked in response |

### ErrorFactory

| Method | Error Code | Status |
|--------|-----------|--------|
| `notFound(resource, id?)` | `DAT0001` | 404 |
| `conflict(message)` | `DAT0002` | 409 |
| `uniqueViolation(field)` | `DAT0003` | 409 |
| `validation(message?, details?)` | `VAL0001` | 400 |
| `invalidStatusTransition(from, to)` | `VAL0004` | 400 |
| `invalidCredentials()` | `AUT0006` | 401 |
| `tokenExpired()` | `AUT0002` | 401 |
| `tokenInvalid()` | `AUT0003` | 401 |
| `authorization(message?)` | `AUZ0001` | 403 |
| `internal(cause?)` | `SRV0001` | 500 |
| `fromZodErrors(zodError)` | `VAL0001` | 400 |

---

## 5. Error Cases

### Adding a New Error Code

1. Open `src/common/constants/error-codes.ts`.
2. Choose the prefix group and next available number.
3. Add: `PREFIX####: { code: 'PREFIX####', message: '...', statusCode: NNN }`.
4. Run the code reviewer agent (`.claude/agents/code-reviewer.md`) to verify uniqueness.
5. Add a factory method in `ErrorFactory` if it will be reused.

### Prisma Error Mapping

| Prisma Code | Mapped To |
|-------------|-----------|
| `P2002` (unique) | `DAT0003` |
| `P2025` (record not found) | `DAT0001` |
| `P2003` (foreign key) | `DAT0004` |
| Other | `DAT0007` |

---

## 6. Configuration

No environment variables control error handling behaviour directly.
Error verbosity is controlled by:
- `LOG_LEVEL` — determines whether debug/trace logs are emitted for caught errors.
- `NODE_ENV=production` — non-operational errors always mask messages regardless of this.

The `isOperational` flag on `AppError` is the primary switch.
`ErrorFactory.internal()` always sets `isOperational: false`.
All other `ErrorFactory` methods set `isOperational: true`.
