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

- [ ] All domain errors thrown via `ErrorFactory` methods
- [ ] No raw `new Error()` or `new HttpException()` in service/controller code
- [ ] New error codes added to `src/common/constants/error-codes.ts` with unique code
- [ ] Error codes follow prefix + 4-digit format and are unique (use `.claude/agents/code-reviewer.md` to verify)
- [ ] Non-operational errors (internal/infra) have `isOperational: false`

## Database

- [ ] All queries on soft-deletable tables include `deletedAt: null` filter
- [ ] Ownership is verified before any mutation (user owns the resource)
- [ ] `passwordHash` is never returned in API responses — use `SafeUser` or explicit `select`
- [ ] Multi-step mutations that must be atomic are wrapped in `prisma.$transaction()`
- [ ] New columns with high query frequency have an index in the Prisma schema

## Auth & Security

- [ ] New routes that require authentication use `@ApiAuth()` (not `@UseGuards(JwtAuthGuard)` directly)
- [ ] New public routes are decorated with `@Public()`
- [ ] API key raw value is never logged or stored — only the hash is persisted

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
