# docs/guides/CONTEXT.md — Feature Guides Router

Each FOR-\*.md guide covers one cross-cutting feature in full depth.

| Feature                                                         | File                    |
| --------------------------------------------------------------- | ----------------------- |
| Multi-tenant isolation (5 defence layers, CLS, tenant-scope ext)| `FOR-Multi-Tenancy.md`  |
| Tweets aggregate — create + recursive-CTE timeline              | `FOR-Tweets.md`         |
| Departments aggregate — adjacency list + tree builder           | `FOR-Departments.md`    |
| ErrorException, domain error constants, exception filters       | `FOR-Error-Handling.md` |
| OpenTelemetry, AppLogger                                        | `FOR-Observability.md`  |
| Database layer (`*DbService`, `*DbRepository`, transactions)    | `FOR-Database-Layer.md` |

Each guide follows this 6-section structure:

1. Business Use Case
2. Flow Diagram
3. Code Structure
4. Key Methods
5. Error Cases
6. Configuration
