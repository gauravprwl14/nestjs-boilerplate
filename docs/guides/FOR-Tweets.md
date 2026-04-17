# FOR-Tweets.md — Tweets Module Feature Guide

> Related: `docs/diagrams/tweets-sequence.md`, `docs/architecture/database-design.md`,
> `docs/guides/FOR-Multi-Tenancy.md`, `docs/coding-guidelines/06-database-patterns.md`

---

## 1. Business Use Case

The Tweets module implements the core domain of the multi-tenant Twitter-like
backend:

- **Create a tweet** scoped to the caller's company, with one of three
  visibility modes: `COMPANY`, `DEPARTMENTS`, `DEPARTMENTS_AND_SUBDEPARTMENTS`.
- **Fetch a timeline** of every tweet the caller is permitted to see, newest
  first, in a single recursive-CTE SQL query.
- **Author self-visibility** — authors always see their own tweets in their
  timeline regardless of the target audience (prevents "ghost tweets").

The module never trusts client input for `companyId` or `authorId` — both
flow exclusively from CLS, populated by the `MockAuthMiddleware`.

---

## 2. Flow Diagram

See `docs/diagrams/tweets-sequence.md` for the full Mermaid sequence diagrams.

```
POST /tweets
  → CLS resolves { userId, companyId, userDepartmentIds } (set by mock-auth)
  → Zod validates content/visibility/departmentIds
  → For DEPARTMENTS*: pre-validate every departmentId lives in caller's company
  → runInTransaction: create Tweet + TweetDepartment rows (flat, companyId on each)

GET /timeline
  → CLS resolves { userId, companyId }
  → Single recursive-CTE $queryRaw evaluates all 4 visibility branches
  → Return up to DEFAULT_TIMELINE_LIMIT rows, newest first
```

---

## 3. Code Structure

```
src/modules/tweets/
├── tweets.module.ts
├── tweets.controller.ts      # POST /tweets, GET /timeline
├── tweets.service.ts         # Business logic + CLS guards
└── dto/
    └── create-tweet.dto.ts   # Zod CreateTweetSchema (content ≤ 280, visibility, departmentIds?)

src/database/tweets/           # @Global — provided by DatabaseModule
├── tweets.db-repository.ts    # delegate via prisma.tenantScoped; raw SQL timeline
└── tweets.db-service.ts       # public surface: createWithTargets, findTimelineForUser
```

---

## 4. Key Methods

### TweetsService

| Method           | Description |
|------------------|-------------|
| `create(dto)`    | Resolves `userId` / `companyId` from CLS; pre-validates `departmentIds` exist in the caller's company (drops silently on cross-tenant via the tenant-scope extension, so length mismatch = violation → `VAL0008`); delegates to `TweetsDbService.createWithTargets` |
| `timeline()`     | Resolves `userId` / `companyId` from CLS; delegates to `TweetsDbService.findTimelineForUser(userId, companyId, DEFAULT_TIMELINE_LIMIT)`; maps snake_case raw-SQL rows to camelCase `TimelineTweet` DTOs |

### TweetsDbService

| Method                                     | Description |
|--------------------------------------------|-------------|
| `createWithTargets(input)`                 | Wraps `TweetsDbRepository.createTweet` + `createTargets` in `DatabaseService.runInTransaction`. Flat payloads only — nested `connect` is a documented tenant-scope blindspot, so we avoid it. |
| `findTimelineForUser(userId, companyId, limit, tx?)` | Delegates to the raw SQL recursive-CTE query in the repository. |

### TweetsDbRepository (raw SQL)

The timeline is one recursive-CTE query (see `findTimelineForUser`):

```sql
WITH RECURSIVE
  user_direct_depts AS (
    SELECT ud.department_id AS id
    FROM user_departments ud
    WHERE ud.user_id = $user AND ud.company_id = $company
  ),
  user_dept_ancestors(id, parent_id) AS (
    SELECT d.id, d.parent_id FROM departments d
    WHERE d.id IN (SELECT id FROM user_direct_depts) AND d.company_id = $company
    UNION
    SELECT p.id, p.parent_id FROM departments p
    INNER JOIN user_dept_ancestors uda ON p.id = uda.parent_id
    WHERE p.company_id = $company
  )
SELECT t.id, t.author_id, t.content, t.visibility, t.created_at
FROM tweets t
WHERE t.company_id = $company
  AND (
    t.author_id = $user
    OR t.visibility = 'COMPANY'
    OR (t.visibility = 'DEPARTMENTS' AND EXISTS (
      SELECT 1 FROM tweet_departments td
      WHERE td.tweet_id = t.id AND td.department_id IN (SELECT id FROM user_direct_depts)
    ))
    OR (t.visibility = 'DEPARTMENTS_AND_SUBDEPARTMENTS' AND EXISTS (
      SELECT 1 FROM tweet_departments td
      WHERE td.tweet_id = t.id AND td.department_id IN (SELECT id FROM user_dept_ancestors)
    ))
  )
ORDER BY t.created_at DESC
LIMIT $limit
```

**Why `UNION` (not `UNION ALL`):** when a user belongs to multiple departments
that share ancestors, per-iteration dedup keeps recursion bounded by the subtree
size instead of exploding on every shared edge.

**Why `company_id` hard-coded everywhere:** `$queryRaw` bypasses the Prisma
tenant-scope extension. Every CTE and the outer select filter on
`company_id = $company` so tenant isolation holds even without the extension.

---

## 5. Error Cases

| Scenario                                      | Error Code | HTTP Status |
|-----------------------------------------------|------------|-------------|
| Missing/unknown `x-user-id` header            | `AUT0001`  | 401 |
| Content missing or > 280 chars                | `VAL0001`  | 400 |
| `visibility` not in enum                      | `VAL0001`  | 400 |
| `DEPARTMENTS` / `DEPARTMENTS_AND_SUBDEPARTMENTS` without `departmentIds` | `VAL0007` | 400 |
| `departmentIds` contains ids outside the caller's company | `VAL0008` | 400 |
| Cross-tenant write sneaks past validation (defensive backstop) | `AUZ0004` | 403 |

---

## 6. Configuration

| Variable                      | Purpose                                      |
|-------------------------------|----------------------------------------------|
| `DEFAULT_TIMELINE_LIMIT`      | Hard limit on timeline rows (`src/common/constants/app.constants.ts`, default 100) |
| `MAX_TWEET_CONTENT_LENGTH`    | Tweet content max length (default 280) |
| `DATABASE_URL`                | Required — Postgres for the entire aggregate |

No runtime environment variables are specific to the tweets module.
