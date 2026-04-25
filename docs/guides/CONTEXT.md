# docs/guides/CONTEXT.md — Feature Guides Router

Each FOR-\*.md guide covers one cross-cutting feature in full depth.

| Feature                                                                                        | File                                                                                   |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Auth context, CLS, simplified mock-auth (order-management domain)                              | `FOR-Multi-Tenancy.md`                                                                 |
| Multi-tier DB layer (`MultiDbService`, `ArchiveRegistryService`, raw pg pools)                 | `FOR-Database-Layer.md`                                                                |
| Orders API (hot/warm/cold routing, UserOrderIndex)                                             | `FOR-Orders.md`                                                                        |
| Archival pipeline (partition rotation, tier promotion)                                         | _(no standalone guide yet — see `src/modules/archival/` and `src/database/archival/`)_ |
| Tweets aggregate — create + recursive-CTE timeline (**legacy / enterprise-twitter domain**)    | `FOR-Tweets.md`                                                                        |
| Departments aggregate — adjacency list + tree builder (**legacy / enterprise-twitter domain**) | `FOR-Departments.md`                                                                   |
| ErrorException, domain error constants, exception filters                                      | `FOR-Error-Handling.md`                                                                |
| OpenTelemetry, AppLogger                                                                       | `FOR-Observability.md`                                                                 |

Each guide follows this 6-section structure:

1. Business Use Case
2. Flow Diagram
3. Code Structure
4. Key Methods
5. Error Cases
6. Configuration
