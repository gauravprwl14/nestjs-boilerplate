# FOR-Error-Handling.md — Error Handling Feature Guide

> Related: `docs/diagrams/error-handling-flow.md`, `docs/coding-guidelines/07-error-handling.md`

---

## 1. Business Use Case

Every API client needs a predictable error format to build reliable UIs and automated integrations.
The error handling system guarantees:

- Every error returns the same JSON shape with a machine-readable `code`.
- Non-userFacing errors (bugs, infra failures) have their messages masked so internal details never reach clients.
- Prisma constraint violations are automatically translated to meaningful error codes with original errors preserved in the cause chain.
- All errors are logged with full context (traceId, requestId, stack, cause chain) for debugging.

---

## 2. Flow Diagram

See `docs/diagrams/error-handling-flow.md` for the full mermaid flowchart.

```
throw (anywhere in app)
  -> AllExceptionsFilter.normalise()
     -> If ErrorException: pass through
     -> If Prisma error: handlePrismaError() -> ErrorException (with cause)
     -> If HttpException: findDefinitionByStatus() -> ErrorException (with cause)
     -> Otherwise: ErrorException.wrap()
  -> errorException.toResponse(isDevelopment)
  -> { success: false, errors: [{ code, message, errorType, errorCategory, retryable, details?, cause? }] }
```

---

## 3. Code Structure

```
src/errors/
├── types/
│   └── error-exception.ts       # ErrorException class — extends Error (NOT HttpException)
├── error-codes/
│   ├── general.errors.ts        # GEN domain constants
│   ├── validation.errors.ts     # VAL domain constants
│   ├── auth.errors.ts           # AUT domain constants
│   ├── authorization.errors.ts  # AUZ domain constants
│   ├── database.errors.ts       # DAT domain constants
│   ├── server.errors.ts         # SRV domain constants
│   └── index.ts                 # Re-exports all domain constants + merged ERROR_CODES
├── interfaces/
│   └── error.interfaces.ts      # ErrorCodeDefinition, ErrorFieldDetail, enums
└── handlers/
    └── prisma-error.handler.ts  # Maps Prisma error codes to ErrorException instances

src/common/
├── filters/
│   └── all-exceptions.filter.ts # @Catch() — catches everything, thin filter
└── interfaces/
    └── api-response.interface.ts # ApiErrorResponse, ApiErrorDetail shapes
```

---

## 4. Key Methods

### ErrorException

| Method/Property                             | Purpose                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| `new ErrorException(definition, options?)`  | Create from an error code definition directly                            |
| `ErrorException.notFound(resource, id?)`    | Static helper — DAT.NOT_FOUND with formatted message                     |
| `ErrorException.validation(zodError)`       | Static helper — converts Zod issues to field details                     |
| `ErrorException.validationFromCV(cvErrors)` | Static helper — converts class-validator errors                          |
| `ErrorException.internal(cause?)`           | Static helper — SRV.INTERNAL_ERROR with cause                            |
| `ErrorException.wrap(unknown)`              | Wrap any unknown error; returns ErrorException as-is or wraps as SRV0001 |
| `ErrorException.isErrorException(val)`      | Type guard                                                               |
| `error.toResponse(includeChain?)`           | Returns response object; masks non-userFacing messages                   |
| `error.toLog()`                             | Returns plain object with full context for logging                       |
| `error.definition`                          | Full ErrorCodeDefinition — single source of truth                        |
| `error.cause`                               | Original error preserved in cause chain                                  |

### Domain Constants

```typescript
import { AUT, DAT, VAL, GEN, AUZ, SRV } from '@errors/error-codes';
```

**Active codes (order-management domain):**

| Constant                        | Error Code | Status | Common Usage                                       |
| ------------------------------- | ---------- | ------ | -------------------------------------------------- |
| `DAT.NOT_FOUND`                 | `DAT0001`  | 404    | Resource not found (orders, archive entries, etc.) |
| `DAT.CONFLICT`                  | `DAT0002`  | 409    | Resource conflict                                  |
| `DAT.UNIQUE_VIOLATION`          | `DAT0003`  | 409    | Unique constraint                                  |
| `DAT.COMPANY_NOT_FOUND`         | `DAT0010`  | 404    | Company lookup failed (defensive)                  |
| `VAL.INVALID_INPUT`             | `VAL0001`  | 400    | Zod/request validation failure                     |
| `VAL.INVALID_STATUS_TRANSITION` | `VAL0004`  | 400    | Status transition (general-purpose)                |
| `AUT.UNAUTHENTICATED`           | `AUT0001`  | 401    | Missing / non-integer `x-user-id` header           |
| `AUZ.FORBIDDEN`                 | `AUZ0001`  | 403    | Access denied                                      |
| `AUZ.INSUFFICIENT_PERMISSIONS`  | `AUZ0002`  | 403    | Missing permissions                                |
| `GEN.REQUEST_TIMEOUT`           | `GEN0002`  | 408    | Timeout                                            |
| `GEN.RATE_LIMITED`              | `GEN0001`  | 429    | Rate limit                                         |
| `SRV.INTERNAL_ERROR`            | `SRV0001`  | 500    | Unexpected error                                   |

**Codes in registry but unused in this domain (enterprise-twitter era):**

| Constant                        | Error Code | Notes                                           |
| ------------------------------- | ---------- | ----------------------------------------------- |
| `DAT.DEPARTMENT_NOT_FOUND`      | `DAT0009`  | Legacy — enterprise-twitter multi-tenancy       |
| `VAL.DEPARTMENT_IDS_REQUIRED`   | `VAL0007`  | Legacy — tweet visibility scoping               |
| `VAL.DEPARTMENT_NOT_IN_COMPANY` | `VAL0008`  | Legacy — tweet department validation            |
| `AUZ.CROSS_TENANT_ACCESS`       | `AUZ0004`  | Legacy — Prisma tenant-scope extension backstop |

> The JWT-era codes `AUT.INVALID_CREDENTIALS`, `AUT.TOKEN_EXPIRED`,
> `AUT.TOKEN_INVALID`, `AUT.ACCOUNT_SUSPENDED`, `AUT.ACCOUNT_LOCKED` still
> exist in `auth.errors.ts` for future use but are not thrown by any code
> path in this build (the JWT/API-key stack has been stripped).

---

## 5. Error Cases

### Adding a New Error Code

1. Open the appropriate domain file in `src/errors/error-codes/`.
2. Pick the next available 4-digit number in that prefix range.
3. Add the entry with all `ErrorCodeDefinition` fields (code, message, httpStatus, errorType, errorCategory, messageKey, severity, retryable, userFacing).
4. Run the code reviewer agent (`.claude/agents/code-reviewer.md`) to verify uniqueness.

### Prisma Error Mapping

| Prisma Code                | Mapped To | Cause Preserved |
| -------------------------- | --------- | --------------- |
| `P2002` (unique)           | `DAT0003` | Yes             |
| `P2025` (record not found) | `DAT0001` | Yes             |
| `P2003` (foreign key)      | `DAT0004` | Yes             |
| `P2011` (null constraint)  | `VAL0002` | Yes             |
| `P2000` (value too long)   | `VAL0003` | Yes             |
| Other known                | `DAT0007` | Yes             |
| Validation error           | `VAL0001` | Yes             |
| Init error                 | `DAT0006` | Yes             |
| Rust panic                 | `SRV0001` | Yes             |
| Unknown request            | `DAT0007` | Yes             |

---

## 6. Configuration

No environment variables control error handling behaviour directly.
Error verbosity is controlled by:

- `LOG_LEVEL` — determines whether debug/trace logs are emitted for caught errors.
- `NODE_ENV=production` — cause chain is excluded from API responses in production.

Message masking is controlled by the `userFacing` flag on `ErrorCodeDefinition`.
If `userFacing: false` (e.g. `SRV.INTERNAL_ERROR`, `DAT.QUERY_FAILED`), the response message is replaced with the generic "Internal server error" message regardless of environment.
