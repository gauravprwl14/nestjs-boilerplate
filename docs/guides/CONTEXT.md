# docs/guides/CONTEXT.md — Feature Guides Router

Each FOR-\*.md guide covers one cross-cutting feature in full depth.

| Feature                                                   | File                    |
| --------------------------------------------------------- | ----------------------- |
| JWT + API Key authentication flows                        | `FOR-Authentication.md` |
| ErrorException, domain error constants, exception filters | `FOR-Error-Handling.md` |
| OpenTelemetry, AppLogger, Grafana pipeline                | `FOR-Observability.md`  |
| TodoLists, TodoItems, Tags, BullMQ processor              | `FOR-Todo-Module.md`    |
| Database layer (*DbService, *DbRepository, transactions)  | `FOR-Database-Layer.md` |

Each guide follows this 6-section structure:

1. Business Use Case
2. Flow Diagram
3. Code Structure
4. Key Methods
5. Error Cases
6. Configuration
