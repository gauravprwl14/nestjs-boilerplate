# Out of Scope

This document lists features that were intentionally left out of the
Enterprise Twitter take-home submission, and how each would be added if the
product continued.

The assignment asked for a multi-tenant backend with department-scoped
visibility. Everything below is either explicitly not in the spec, or it
would take the solution beyond the time budget without adding new signal for
the review.

---

## Timeline pagination

The timeline query returns at most 100 rows, newest first (see
`DEFAULT_TIMELINE_LIMIT` in `src/common/constants/app.constants.ts`).

Cursor-based pagination is a small extension:

- Add `before` (cursor) and `limit` query parameters to `GET /api/v1/timeline`.
- Use `(createdAt, id)` as the cursor — stable even when many tweets share
  a `createdAt`.
- Add a `WHERE (t.created_at, t.id) < ($beforeCreatedAt, $beforeId)`
  predicate to the existing CTE query.

Offset pagination was deliberately avoided — it does not survive inserts and
scales poorly past a few thousand rows.

## Tweet update, delete, replies, likes, search

None are in the assignment spec. They would each need their own controller
and DTO, and likes/search would also need indexes that are not worth adding
without the read paths to use them.

## Registration, login, JWT, API keys

The boilerplate originally shipped with a JWT + API key auth stack. We
removed it because the assignment explicitly allows mock auth via a
header, and carrying the full stack made the multi-tenant story harder to
read.

Production rollout swaps `MockAuthMiddleware` for a real JWT guard. The
contract is unchanged — the guard must publish the same
`{ userId, companyId, userDepartmentIds }` tuple into CLS, and every layer
below stays the same.

## Department update and delete

Only `POST /api/v1/departments` and `GET /api/v1/departments` (+ `/tree`)
are exposed. Update and delete would need:

- A move-subtree operation that respects the same-company composite FK.
- A soft-delete path that cascades to `userDepartment` memberships and
  rewrites `tweetDepartment` targets.

Neither is needed to demonstrate visibility correctness.

## Observability

OpenTelemetry scaffolding exists under `src/telemetry/` but is disabled by
default (`OTEL_ENABLED=false`). Enabling it in infrastructure environments
wires up traces, metrics, and log correlation. See
`docs/infrastructure/04-grafana-stack-setup.md` for the collector and
dashboard wiring.

## Rate limiting, request size limits, CORS tuning

Stock NestJS defaults are in place. Production would add per-tenant rate
limits (e.g. `@nestjs/throttler` keyed by `companyId` from CLS) and a
tightened CORS config.
