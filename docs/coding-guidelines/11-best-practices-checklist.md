# 11 — Best Practices Checklist

Use this checklist before opening a pull request.

## Code Quality

- [ ] No hardcoded strings — all repeated strings are constants in `*.constants.ts` or `src/common/constants/`
- [ ] All public methods have JSDoc comments (description, `@param`, `@returns`, `@throws`)
- [ ] No `console.log` — use `AppLogger.logEvent` or `AppLogger.logError`
- [ ] No `any` TypeScript type — use proper types or `unknown` with narrowing
- [ ] Path aliases used (`@common/`, `@modules/`, etc.) — no `../../` relative imports beyond one level
- [ ] All async methods use `async/await` — no raw `.then().catch()` chains

## Error Handling

- [ ] All domain errors thrown via `new ErrorException(DEFINITION)` or static helpers
- [ ] No raw `new Error()` or `new HttpException()` in service/controller code
- [ ] New error codes added to the appropriate domain file in `src/errors/error-codes/`
- [ ] Error codes follow prefix + 4-digit format and are unique (use `.claude/agents/code-reviewer.md` to verify)
- [ ] Non-userFacing definitions (e.g. `SRV.INTERNAL_ERROR`) used for internal errors

## Database

- [ ] Tenant-scoped aggregates go through `prisma.tenantScoped` (injected automatically in repositories that route `delegateFor` via it)
- [ ] Tenant-scoped writes never use nested `connect` — use flat payloads with explicit `companyId`
- [ ] Raw SQL queries hard-code `company_id = ${companyId}` in every predicate and CTE
- [ ] Soft-deletable queries include `deletedAt: null` filter (no soft-deletable aggregates ship in this build, but the pattern still applies)
- [ ] Multi-step mutations that must be atomic use `DatabaseService.runInTransaction()` (not `prisma.$transaction()` directly from feature code)
- [ ] New columns with high query frequency have an index in the Prisma schema
- [ ] New tenant-scoped models are added to `TENANT_SCOPED_MODELS` in `src/database/extensions/tenant-scope.extension.ts`

## Auth & Security

- [ ] New routes rely on the global `AuthContextGuard` (via `MockAuthMiddleware` publishing CLS). Routes that must stay anonymous are decorated with `@Public()`
- [ ] `companyId` and `authorId` are NEVER read from the request body — always from CLS
- [ ] Controllers that require mock auth add `@ApiSecurity('x-user-id')` for Swagger
- [ ] Cross-tenant attempts fail with `AUZ.CROSS_TENANT_ACCESS` (extension) or `VAL.DEPARTMENT_NOT_IN_COMPANY` (service pre-validation)

## Module / DI

- [ ] New module is registered in `AppModule.imports`
- [ ] Services only import what they need — no unused injected providers
- [ ] No circular dependencies between modules (check with `nest info` if unsure)
- [ ] Global modules (`PrismaModule`, `AppLoggerModule`, etc.) are not re-imported in feature modules

## API Design

- [ ] All endpoints have `@ApiOperation` and `@ApiResponse` decorators
- [ ] Response codes match the operation (201 for create, 204 for no-content delete)
- [ ] UUID path params use `ParseUUIDPipe`
- [ ] Query params for list endpoints include pagination (`page`, `limit`)

## Testing

- [ ] Unit tests written for all new service methods
- [ ] Tests follow AAA pattern with explicit comments
- [ ] Mock factories in `test/helpers/` used — no inline mock data
- [ ] `jest.clearAllMocks()` called in `afterEach`
- [ ] Coverage does not drop below thresholds (`npm run test:cov`)

## Observability

- [ ] Key service methods decorated with `@Trace()` or `@InstrumentClass()`
- [ ] Domain events logged with `logEvent` at the point they occur
- [ ] New metric increments/durations use decorator pattern, not manual SDK calls
