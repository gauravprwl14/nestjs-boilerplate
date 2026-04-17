# Todo App — Product Requirements Document

## Goal

Deliver a fully-functional Todo management REST API that serves as the reference implementation
for the AI-native NestJS boilerplate. The API demonstrates authentication, CRUD, status transitions,
tag management, background job processing, and observability — all following production-ready patterns.

---

## Target Users

**Primary:** Backend engineers and teams who clone this boilerplate to bootstrap new projects.
They need clear patterns they can follow, extend, and hand off to AI coding assistants.

**Secondary:** AI coding assistants (Claude, Copilot, etc.) that use the structured docs to generate
consistent code without drifting from established patterns.

---

## Features

### Authentication & Identity

- User registration with email + password (bcrypt hashed, 12 rounds)
- JWT login returning access token (15 min) + refresh token (7 days)
- Refresh token rotation (single-use, revoke on use)
- Change password (revokes all refresh tokens)
- API Key creation, listing, and revocation
- API Key authentication as alternative to JWT for machine-to-machine access

### User Management

- View own profile (`GET /users/me`)
- Update own profile firstName/lastName (`PATCH /users/me`)

### Todo Lists

- Create, read, update, soft-delete todo lists (user-scoped)
- Paginated list of all lists for current user

### Todo Items

- Create, read, update, soft-delete todo items within a list
- Status transitions: `PENDING → IN_PROGRESS → COMPLETED → ARCHIVED`
- Priority levels: `LOW`, `MEDIUM`, `HIGH`, `URGENT`
- Due date and completion timestamp tracking
- BullMQ background job triggered on item completion
- Paginated list with filter by status and priority

### Tags

- Create global tags (name + optional color)
- List all tags
- Assign a tag to a todo item
- Remove a tag from a todo item

### Observability

- OpenTelemetry traces auto-instrumented for all HTTP requests and Prisma queries
- Structured JSON logs via Pino, correlated by traceId and requestId
- Prometheus metrics (request count, duration, errors)
- Grafana dashboards pre-provisioned for traces (Tempo), logs (Loki), metrics (Prometheus)

### Infrastructure

- Health check endpoint (Terminus)
- Rate limiting (ThrottlerModule, configurable TTL + limit)
- Request ID middleware (UUID per request)
- Security headers middleware (Helmet)
- Graceful shutdown with configurable timeout

---

## API Endpoints

| #   | Method | Path                          | Auth   | Description                                     |
| --- | ------ | ----------------------------- | ------ | ----------------------------------------------- |
| 1   | POST   | `/auth/register`              | Public | Register new user account                       |
| 2   | POST   | `/auth/login`                 | Public | Login with email + password                     |
| 3   | POST   | `/auth/refresh`               | Public | Exchange refresh token for new token pair       |
| 4   | POST   | `/auth/change-password`       | JWT    | Change own password                             |
| 5   | POST   | `/auth/api-keys`              | JWT    | Create a new API key                            |
| 6   | GET    | `/auth/api-keys`              | JWT    | List own API keys                               |
| 7   | DELETE | `/auth/api-keys/:id`          | JWT    | Revoke an API key                               |
| 8   | GET    | `/users/me`                   | JWT    | Get own profile                                 |
| 9   | PATCH  | `/users/me`                   | JWT    | Update own profile                              |
| 10  | POST   | `/todo-lists`                 | JWT    | Create a todo list                              |
| 11  | GET    | `/todo-lists`                 | JWT    | List all todo lists (paginated)                 |
| 12  | GET    | `/todo-lists/:id`             | JWT    | Get a single todo list                          |
| 13  | PATCH  | `/todo-lists/:id`             | JWT    | Update a todo list                              |
| 14  | DELETE | `/todo-lists/:id`             | JWT    | Soft-delete a todo list                         |
| 15  | POST   | `/todo-lists/:listId/items`   | JWT    | Create a todo item                              |
| 16  | GET    | `/todo-lists/:listId/items`   | JWT    | List todo items in a list (paginated + filters) |
| 17  | GET    | `/todo-items/:id`             | JWT    | Get a single todo item                          |
| 18  | PATCH  | `/todo-items/:id`             | JWT    | Update a todo item (incl. status transition)    |
| 19  | DELETE | `/todo-items/:id`             | JWT    | Soft-delete a todo item                         |
| 20  | POST   | `/tags`                       | JWT    | Create a tag                                    |
| 21  | GET    | `/tags`                       | JWT    | List all tags                                   |
| 22  | POST   | `/todo-items/:id/tags/:tagId` | JWT    | Assign tag to item                              |
| 23  | DELETE | `/todo-items/:id/tags/:tagId` | JWT    | Remove tag from item                            |
| 24  | GET    | `/health`                     | Public | Health check (Terminus)                         |

> **Note:** All endpoints are prefixed with `/api/v1` by default (`API_PREFIX=api`, `API_VERSION=v1`).
> Auth column "JWT" means the global `JwtAuthGuard` applies; API Key strategy can also be used.

---

## Non-Functional Requirements

| Category      | Requirement                                                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Response time | p99 < 200 ms for standard CRUD on local infrastructure                                                                                                    |
| Availability  | Stateless app tier — horizontal scaling via container orchestration                                                                                       |
| Security      | bcrypt passwords, hashed API keys, JWT short-lived access tokens, Helmet headers, rate limiting                                                           |
| Observability | 100% of HTTP requests traced; logs include traceId, requestId, userId                                                                                     |
| Error format  | All errors return `{ success: false, errors: [{ code, message, errorType, errorCategory, retryable, details?, cause? }], requestId, traceId, timestamp }` |
| Validation    | All request bodies validated via Zod (env) or class-validator (HTTP DTOs) before handler execution                                                        |
| Soft delete   | TodoList and TodoItem use `deletedAt` timestamp; never hard-deleted                                                                                       |
| Test coverage | ≥ 80% line coverage on services and repositories                                                                                                          |
| Config        | All configuration via environment variables; no hardcoded values                                                                                          |

---

## Out of Scope (v1.0)

- Email verification flow (PENDING_VERIFICATION status exists but email sending is not implemented)
- Multi-tenant/organisation support
- File uploads or attachments
- Real-time (WebSocket) updates
- Mobile or web frontend
