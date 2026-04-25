# Tweets / Timeline Sequence Diagrams

<!-- DOC-SYNC: Diagram updated on 2026-04-25. LEGACY: TweetsModule and DepartmentsModule were replaced by OrdersModule/ArchivalModule/MockDataModule. These diagrams describe the enterprise-twitter domain which is no longer the active feature set. The auth flow (x-user-id) has also changed — MockAuthMiddleware no longer calls UsersDbService; it parses the header directly. Retain for historical reference only. Please verify visual accuracy before committing. -->

> See `docs/guides/FOR-Tweets.md` for the full feature guide.
> See `docs/guides/FOR-Multi-Tenancy.md` for the CLS + tenant-scope background.

## Create Tweet

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant MW as MockAuthMiddleware
    participant G as AuthContextGuard
    participant TC as TweetsController
    participant TS as TweetsService
    participant DS as DepartmentsDbService
    participant TDS as TweetsDbService
    participant PG as PostgreSQL

    C->>MW: POST /api/v1/tweets\nx-user-id: <uuid>
    MW->>PG: findUnique user + direct depts
    PG-->>MW: User + UserDepartment[]
    MW->>MW: CLS.set { userId, companyId, userDepartmentIds }
    MW->>G: next()
    G->>G: cls.companyId exists? yes
    G->>TC: handler
    TC->>TC: ZodValidationPipe validates body
    TC->>TS: create(dto)
    alt visibility != COMPANY
      TS->>DS: findExistingIdsInCompany(dto.departmentIds, companyId)
      Note right of DS: tenant-scope extension injects where.companyId<br/>cross-tenant ids silently drop
      DS-->>TS: subset that exists in this tenant
      TS->>TS: length mismatch → throw VAL0008 DEPARTMENT_NOT_IN_COMPANY
    end
    TS->>TDS: createWithTargets(...)
    TDS->>PG: BEGIN → INSERT tweets → INSERT tweet_departments (flat, companyId per row) → COMMIT
    PG-->>TDS: Tweet
    TDS-->>TS: Tweet
    TS-->>TC: Tweet
    TC-->>C: 201 { success: true, data: Tweet }
```

## Get Timeline

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant MW as MockAuthMiddleware
    participant G as AuthContextGuard
    participant TC as TweetsController
    participant TS as TweetsService
    participant TDS as TweetsDbService
    participant PG as PostgreSQL

    C->>MW: GET /api/v1/timeline\nx-user-id: <uuid>
    MW->>MW: resolve user + set CLS (as above)
    MW->>G: next()
    G->>TC: canActivate ok
    TC->>TS: timeline()
    TS->>TDS: findTimelineForUser(userId, companyId, 100)
    TDS->>PG: $queryRaw WITH RECURSIVE ...\nhard-coded company_id = $company in every predicate
    PG-->>TDS: TimelineRow[]  (snake_case)
    TDS-->>TS: TimelineRow[]
    TS->>TS: map rows → TimelineTweet[] (camelCase)
    TS-->>TC: TimelineTweet[]
    TC-->>C: 200 { success: true, data: TimelineTweet[] }
```

## Error path — missing/unknown x-user-id

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant MW as MockAuthMiddleware
    participant F as AllExceptionsFilter

    C->>MW: GET /api/v1/timeline  (no x-user-id)
    MW->>F: throw ErrorException(AUT.UNAUTHENTICATED)
    F-->>C: 401 { success: false, errors: [{ code: "AUT0001", ... }] }
```

## Visibility Branches (ACL summary)

```mermaid
flowchart TD
    Start([Timeline query for user U in company C])
    Start --> SameCompany{"tweet.company_id = C?"}
    SameCompany -->|No| Deny[Hidden]
    SameCompany -->|Yes| SelfAuthor{"tweet.author_id = U?"}
    SelfAuthor -->|Yes| Show[Visible]
    SelfAuthor -->|No| CompanyScope{"visibility = COMPANY?"}
    CompanyScope -->|Yes| Show
    CompanyScope -->|No| Dept{"visibility = DEPARTMENTS?"}
    Dept -->|Yes| DeptMatch{"target ∈ U's direct depts?"}
    DeptMatch -->|Yes| Show
    DeptMatch -->|No| Deny
    Dept -->|No| DeptSub{"visibility = DEPARTMENTS_AND_SUBDEPARTMENTS?"}
    DeptSub -->|Yes| AncestorMatch{"target ∈ U's ancestor set\n(recursive CTE)?"}
    AncestorMatch -->|Yes| Show
    AncestorMatch -->|No| Deny
```
