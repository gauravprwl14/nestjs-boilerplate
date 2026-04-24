# docs/guides/CONTEXT.md — Feature Guides Router

Each FOR-\*.md guide covers one cross-cutting feature in full depth.

| Feature                                                                        | File                                             |
| ------------------------------------------------------------------------------ | ------------------------------------------------ |
| Multi-tenant isolation (5 defence layers, CLS, tenant-scope ext)               | `FOR-Multi-Tenancy.md`                           |
| Multi-tier DB layer (`MultiDbService`, `ArchiveRegistryService`, raw pg pools) | `FOR-Database-Layer.md`                          |
| Orders API (hot/warm/cold routing, UserOrderIndex)                             | `FOR-Orders.md` _(pending — feat/om-orders)_     |
| Archival pipeline (partition rotation, tier promotion)                         | `FOR-Archival.md` _(pending — feat/om-archival)_ |
| Tweets aggregate — create + recursive-CTE timeline (legacy)                    | `FOR-Tweets.md`                                  |
| Departments aggregate — adjacency list + tree builder (legacy)                 | `FOR-Departments.md`                             |
| ErrorException, domain error constants, exception filters                      | `FOR-Error-Handling.md`                          |
| OpenTelemetry, AppLogger                                                       | `FOR-Observability.md`                           |

Each guide follows this 6-section structure:

1. Business Use Case
2. Flow Diagram
3. Code Structure
4. Key Methods
5. Error Cases
6. Configuration
