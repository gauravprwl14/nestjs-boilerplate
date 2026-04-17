# FOR-Todo-Module.md — Todo Module Feature Guide

> Related: `docs/diagrams/todo-crud-sequence.md`, `docs/architecture/database-design.md`, `docs/coding-guidelines/06-database-patterns.md`

---

## 1. Business Use Case

The Todo module is the primary domain of the boilerplate. It demonstrates:

- Three-level hierarchy: **User** owns **TodoLists**, which contain **TodoItems**.
- Status machine: TodoItems transition through `PENDING → IN_PROGRESS → COMPLETED → ARCHIVED`.
- Tag system: Global `Tag` entities can be assigned to any TodoItem (many-to-many via `TodoItemTag`).
- Background jobs: When an item reaches `COMPLETED`, a BullMQ job is dispatched for async processing.
- Ownership enforcement: Every mutation verifies the requesting user owns the resource.
- Soft delete: Lists and items use `deletedAt` — never hard-deleted.

---

## 2. Flow Diagram

See `docs/diagrams/todo-crud-sequence.md` for full sequence diagrams.

```
Create List → Create Item → Update Status → Assign Tag
                                ↓ (COMPLETED)
                           BullMQ Queue → TodoItemProcessor
```

### Valid Status Transitions

| From          | To                          |
| ------------- | --------------------------- |
| `PENDING`     | `IN_PROGRESS`, `ARCHIVED`   |
| `IN_PROGRESS` | `COMPLETED`, `PENDING`      |
| `COMPLETED`   | `ARCHIVED`                  |
| `ARCHIVED`    | (terminal — no transitions) |

---

## 3. Code Structure

Feature modules contain only business logic and HTTP concerns. All Prisma access goes through the database layer.

```
src/modules/todo-lists/
├── todo-lists.module.ts
├── todo-lists.controller.ts   # /todo-lists CRUD endpoints
├── todo-lists.service.ts      # Business logic + ownership checks; injects TodoListsDbService
└── dto/
    ├── create-todo-list.dto.ts
    └── update-todo-list.dto.ts

src/modules/todo-items/
├── todo-items.module.ts
├── todo-items.controller.ts   # /todo-lists/:listId/items + /todo-items/:id
├── todo-items.service.ts      # CRUD + status transitions + queue dispatch; injects TodoItemsDbService
├── todo-item.processor.ts     # BullMQ @Processor — handles completed-item jobs
└── dto/
    ├── create-todo-item.dto.ts
    ├── update-todo-item.dto.ts
    └── query-todo-items.dto.ts  # Pagination + status/priority filters

src/modules/tags/
├── tags.module.ts
├── tags.controller.ts         # /tags CRUD + /todo-items/:id/tags/:tagId assign/remove
├── tags.service.ts            # Injects TagsDbService (catalog) + TodoItemsDbService (join table)
└── dto/
    └── create-tag.dto.ts
```

Database layer counterparts (global — no import required):

```
src/database/
├── todo-lists/
│   ├── todo-lists.db-repository.ts
│   └── todo-lists.db-service.ts     # TodoListsDbService
├── todo-items/
│   ├── todo-items.db-repository.ts
│   └── todo-items.db-service.ts     # TodoItemsDbService (owns TodoItemTag join table)
└── tags/
    ├── tags.db-repository.ts
    └── tags.db-service.ts           # TagsDbService (owns Tag catalog only)
```

---

## 4. Key Methods

### TodoListsService

| Method                    | Description                                            |
| ------------------------- | ------------------------------------------------------ |
| `create(userId, dto)`     | Create list owned by userId                            |
| `findAll(userId, params)` | Paginated list for userId; includes soft-delete filter |
| `findOne(userId, id)`     | Find list by id with ownership check                   |
| `update(userId, id, dto)` | Update title/description with ownership check          |
| `remove(userId, id)`      | Soft delete (`deletedAt = now()`) with ownership check |

### TodoItemsService

| Method                           | Description                                                               |
| -------------------------------- | ------------------------------------------------------------------------- |
| `create(userId, listId, dto)`    | Verify list ownership, create item with PENDING status                    |
| `findAll(userId, listId, query)` | Paginated items; filter by status/priority                                |
| `findOne(userId, id)`            | Find item with ownership check (via list join)                            |
| `update(userId, id, dto)`        | Update item; validate status transition; dispatch BullMQ job on COMPLETED |
| `remove(userId, id)`             | Soft delete with ownership check                                          |

### TagsService

| Method                                  | Description                               |
| --------------------------------------- | ----------------------------------------- |
| `create(dto)`                           | Create global tag (name must be unique)   |
| `findAll()`                             | List all tags                             |
| `assignToItem(userId, itemId, tagId)`   | Verify item ownership, upsert TodoItemTag |
| `removeFromItem(userId, itemId, tagId)` | Verify item ownership, delete TodoItemTag |

### TodoItemProcessor

The BullMQ processor handles `todo-item-completed` jobs:

```typescript
@Processor(TODO_ITEM_QUEUE_NAME)
export class TodoItemProcessor {
  @Process(TODO_ITEM_COMPLETED_JOB)
  async handleCompleted(job: Job<{ itemId: string }>): Promise<void> {
    // Side effects: notifications, analytics, webhooks, etc.
  }
}
```

---

## 5. Error Cases

| Scenario                          | Error Code                   | Status                               |
| --------------------------------- | ---------------------------- | ------------------------------------ |
| TodoList not found                | `DAT0001`                    | 404                                  |
| TodoItem not found                | `DAT0001`                    | 404                                  |
| List/item belongs to another user | `DAT0001`                    | 404 (not 403 — don't leak existence) |
| Invalid status transition         | `VAL0004`                    | 400                                  |
| Tag name already exists           | `DAT0003`                    | 409                                  |
| Tag not found when assigning      | `DAT0001`                    | 404                                  |
| Duplicate tag assignment          | Idempotent upsert — no error |

---

## 6. Configuration

| Variable                   | Effect                               |
| -------------------------- | ------------------------------------ |
| `REDIS_HOST`, `REDIS_PORT` | Required for BullMQ queue operations |
| `REDIS_PASSWORD`           | Optional Redis auth                  |

The queue name and job name are defined as constants:

- `src/modules/todo-items/todo-items.constants.ts` → `TODO_ITEM_QUEUE_NAME`, `TODO_ITEM_COMPLETED_JOB`

To disable background job processing (e.g. in tests), mock `QueueModule` or set `REDIS_HOST` to a non-existent host and handle `SRV0002` errors gracefully.
