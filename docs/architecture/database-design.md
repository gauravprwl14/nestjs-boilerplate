# Database Design

## ER Diagram

```mermaid
erDiagram
    User {
        String id PK
        String email UK
        String passwordHash
        String firstName
        String lastName
        UserRole role
        UserStatus status
        DateTime lockedUntil
        Int failedLoginCount
        DateTime createdAt
        DateTime updatedAt
        DateTime deletedAt
    }

    RefreshToken {
        String id PK
        String token UK
        String userId FK
        DateTime expiresAt
        DateTime revokedAt
        DateTime createdAt
    }

    ApiKey {
        String id PK
        String name
        String keyHash UK
        String prefix
        String userId FK
        ApiKeyStatus status
        DateTime lastUsedAt
        DateTime expiresAt
        DateTime createdAt
    }

    TodoList {
        String id PK
        String title
        String description
        String userId FK
        DateTime createdAt
        DateTime updatedAt
        DateTime deletedAt
    }

    TodoItem {
        String id PK
        String title
        String description
        TodoStatus status
        TodoPriority priority
        DateTime dueDate
        DateTime completedAt
        String todoListId FK
        DateTime createdAt
        DateTime updatedAt
        DateTime deletedAt
    }

    Tag {
        String id PK
        String name UK
        String color
        DateTime createdAt
    }

    TodoItemTag {
        String todoItemId PK_FK
        String tagId PK_FK
        DateTime assignedAt
    }

    User ||--o{ RefreshToken : "has"
    User ||--o{ ApiKey : "owns"
    User ||--o{ TodoList : "owns"
    TodoList ||--o{ TodoItem : "contains"
    TodoItem ||--o{ TodoItemTag : "tagged with"
    Tag ||--o{ TodoItemTag : "applied to"
```

## Enums

| Enum | Values |
|------|--------|
| `UserStatus` | `ACTIVE`, `SUSPENDED`, `PENDING_VERIFICATION` |
| `UserRole` | `USER`, `ADMIN` |
| `ApiKeyStatus` | `ACTIVE`, `REVOKED` |
| `TodoStatus` | `PENDING`, `IN_PROGRESS`, `COMPLETED`, `ARCHIVED` |
| `TodoPriority` | `LOW`, `MEDIUM`, `HIGH`, `URGENT` |

## Soft Delete Strategy

`User`, `TodoList`, and `TodoItem` use a `deletedAt: DateTime?` column for soft deletes.
All queries **must** include `where: { deletedAt: null }` (or use the `BaseRepository` helpers
which apply this filter automatically).

Hard delete is only performed on `RefreshToken` and `ApiKey` cascade when a `User` is deleted.

## Indexes

| Table | Indexed Columns | Purpose |
|-------|----------------|---------|
| `refresh_tokens` | `userId` | Fast lookup of all tokens for a user on login/refresh |
| `api_keys` | `userId` | Fast lookup of all keys for a user |
| `todo_lists` | `userId` | List all lists for a user |
| `todo_items` | `todoListId` | List all items in a list |
| `todo_items` | `status` | Filter items by status |
| `todo_items` | `priority` | Filter items by priority |
| `todo_items` | `dueDate` | Sort/filter by due date |

## Cascade Rules

- `User` deleted → `RefreshToken`, `ApiKey`, `TodoList` cascade delete.
- `TodoList` deleted → `TodoItem` cascade delete.
- `TodoItem` deleted → `TodoItemTag` cascade delete.
- `Tag` deleted → `TodoItemTag` cascade delete.
