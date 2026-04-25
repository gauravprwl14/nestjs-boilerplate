# Technical Assumptions

These are the assumptions baked into the current design.
If any assumption is invalidated, update this document and review the affected components.

---

## Runtime & Platform

| Assumption                              | Impact if wrong                                                                                |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Node.js 22 LTS is the runtime           | OTel SDK and Prisma versions may need updating for older Node versions                         |
| Linux containers for production         | Native bindings (none currently) may behave differently on Windows dev — use Docker for parity |
| Single-region deployment for this build | Multi-region adds clock drift concerns and Postgres replication complexity                     |

## Database

| Assumption                                                                  | Impact if wrong                                                                                                  |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| PostgreSQL 16 is the database engine for all 7 DB instances                 | Prisma migrations and raw SQL use PG-specific syntax (e.g. `ANY($1)`, `pg_database_size`)                        |
| `pg` (node-postgres) is used for all runtime queries                        | ORM-level features (soft delete, relations) are unavailable — enforce in raw SQL                                 |
| Streaming replication is configured on primary → replicas                   | Stale reads are possible on replicas; replica lag must be acceptable for order listings                          |
| `user_order_index` is the single source of truth for tier routing           | Missing or stale index entries will cause `DAT.NOT_FOUND` even if the order exists in a tier                     |
| Cold archive DBs are registered in `archive_databases` table before startup | `ArchiveRegistryService.onModuleInit` will load zero entries and cold-tier reads will fail if the table is empty |

## Authentication

| Assumption                                                                    | Impact if wrong                                                                                                              |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Mock auth via `x-user-id` (positive integer) is acceptable for this take-home | Swap `MockAuthMiddleware` for a real JWT/OIDC guard; it must publish `ClsKey.USER_ID` as a number to keep services unchanged |
| The header contains a trusted user ID (no DB validation)                      | Real deployments must ensure the header is signed or comes from a trusted proxy — current middleware trusts it completely    |

## Multi-Tier Storage

| Assumption                                                                     | Impact if wrong                                                                          |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| CLS (AsyncLocalStorage) propagates `userId` to every await                     | A misconfigured module could lose context — `AuthContextGuard` is the fail-fast backstop |
| User isolation is enforced by explicit `WHERE user_id = $N` in every query     | Missing a predicate in a raw SQL query causes cross-user data exposure                   |
| Cold archive pools (tier 4) are lazily created and never closed until shutdown | Idle archive pool connections remain open until the app restarts                         |

## Infrastructure

| Assumption                                                   | Impact if wrong                                                       |
| ------------------------------------------------------------ | --------------------------------------------------------------------- |
| OTel Collector is optional (`OTEL_ENABLED=false` by default) | Disabling OTel removes distributed tracing; logs still work via Pino  |
| No Redis / no BullMQ                                         | No async-job dispatch available — reintroduce `QueueModule` if needed |
| Docker Compose is sufficient for local dev                   | Teams using Kubernetes locally will need to adapt compose to helm     |

## Security

| Assumption                                                           | Impact if wrong                                                                                                                                                                |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| HTTPS termination happens at the load balancer/proxy, not in the app | Running the app directly on HTTPS requires adding TLS config to `main.ts`                                                                                                      |
| `x-user-id` mock auth is REPLACED before production                  | Shipping mock auth to production is a total auth bypass — see the archived `2026-04-17_FOR-Authentication.md` for the previous JWT/API-key stack as a reference implementation |

## Testing

| Assumption                                                    | Impact if wrong                                                                                      |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Integration tests run against a real PostgreSQL test database | Using SQLite in-memory for tests would miss `ANY($1)`, `pg_database_size`, and pool-switch behaviour |
| ≥ 70% global line coverage, ≥ 80% on services is the minimum  | Lower coverage may leave tier-routing edge cases untested                                            |
| k6 load tests validate p95 latency targets                    | Without load testing, pool exhaustion and archival bottlenecks will only surface in production       |
