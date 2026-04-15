# Todo CRUD Sequence Diagrams

> See `docs/guides/FOR-Todo-Module.md` for the full feature guide.

## Create Todo List

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant TLC as TodoListsController
    participant TLS as TodoListsService
    participant PG as PostgreSQL

    C->>TLC: POST /api/v1/todo-lists { title, description }
    TLC->>TLC: ZodValidationPipe
    TLC->>TLS: create(userId, dto)
    TLS->>PG: INSERT todo_list { title, description, userId }
    PG-->>TLS: TodoList
    TLS-->>TLC: TodoList
    TLC-->>C: 201 { success: true, data: TodoList }
```

## Create Todo Item

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant TIC as TodoItemsController
    participant TIS as TodoItemsService
    participant PG as PostgreSQL

    C->>TIC: POST /api/v1/todo-lists/:listId/items { title, priority, dueDate }
    TIC->>TIC: ParseUUIDPipe on listId
    TIC->>TIS: create(userId, listId, dto)
    TIS->>PG: SELECT todo_list WHERE id = listId AND userId AND deletedAt IS NULL
    PG-->>TIS: TodoList (ownership check)
    TIS->>PG: INSERT todo_item { title, priority, dueDate, todoListId, status: PENDING }
    PG-->>TIS: TodoItem
    TIS-->>TIC: TodoItem
    TIC-->>C: 201 { success: true, data: TodoItem }
```

## Update Item Status (Transition)

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant TIC as TodoItemsController
    participant TIS as TodoItemsService
    participant BQ as BullMQ
    participant PG as PostgreSQL

    C->>TIC: PATCH /api/v1/todo-items/:id { status: "COMPLETED" }
    TIC->>TIS: update(userId, id, dto)
    TIS->>PG: SELECT todo_item WHERE id AND userId (via list join)
    PG-->>TIS: TodoItem { status: IN_PROGRESS }
    TIS->>TIS: validateStatusTransition(IN_PROGRESS → COMPLETED)
    alt invalid transition
        TIS-->>C: 400 VAL0004 InvalidStatusTransition
    end
    TIS->>PG: UPDATE todo_item SET status = COMPLETED, completedAt = NOW()
    PG-->>TIS: updated TodoItem
    TIS->>BQ: queue.add('todo-item-completed', { itemId })
    TIS-->>TIC: TodoItem
    TIC-->>C: 200 { success: true, data: TodoItem }

    Note over BQ: BullMQ processes job async
    BQ->>TIS: TodoItemProcessor.process({ itemId })
```

## Assign Tag to Item

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant TC as TagsController
    participant TS as TagsService
    participant PG as PostgreSQL

    C->>TC: POST /api/v1/todo-items/:id/tags/:tagId
    TC->>TS: assignToItem(userId, itemId, tagId)
    TS->>PG: SELECT todo_item (ownership check via todo_list.userId)
    PG-->>TS: TodoItem
    TS->>PG: SELECT tag WHERE id = tagId
    PG-->>TS: Tag
    TS->>PG: INSERT todo_item_tag { todoItemId, tagId }
    PG-->>TS: TodoItemTag
    TS-->>TC: TodoItemTag
    TC-->>C: 201 { success: true, data: TodoItemTag }
```

## Valid Status Transitions

```mermaid
stateDiagram-v2
    [*] --> PENDING
    PENDING --> IN_PROGRESS
    IN_PROGRESS --> COMPLETED
    IN_PROGRESS --> PENDING
    COMPLETED --> ARCHIVED
    PENDING --> ARCHIVED
```
