import { Injectable } from '@nestjs/common';
import { TodoItem, TodoItemTag, TodoPriority, TodoStatus } from '@prisma/client';
import {
  TodoItemsDbRepository,
  TodoItemFilters,
} from '@database/todo-items/todo-items.db-repository';
import { DbTransactionClient } from '@database/types';
import { PaginationParams, PaginatedResult } from '@common/interfaces';

export type { TodoItemFilters };

/**
 * DB-layer service for the TodoItem + TodoItemTag aggregate. Only file
 * outside src/database that can reach those models.
 */
@Injectable()
export class TodoItemsDbService {
  constructor(private readonly repo: TodoItemsDbRepository) {}

  /**
   * Creates a new todo item inside the given list.
   * @param listId - Owning TodoList UUID
   * @param input - Item fields (title required; rest optional)
   * @param tx - Optional transaction client
   */
  createInList(
    listId: string,
    input: {
      title: string;
      description?: string | null;
      priority?: TodoPriority;
      dueDate?: Date | null;
    },
    tx?: DbTransactionClient,
  ): Promise<TodoItem> {
    return this.repo.createInList(listId, input, tx);
  }

  /**
   * Returns paginated, filtered items for a list.
   * @param listId - Owning TodoList UUID
   * @param filters - Optional filters (status, priority, dueDate, tagId, overdue)
   * @param pagination - Page/limit/sort parameters
   * @param tx - Optional transaction client
   */
  findByListId(
    listId: string,
    filters: TodoItemFilters,
    pagination: PaginationParams,
    tx?: DbTransactionClient,
  ): Promise<PaginatedResult<TodoItem>> {
    return this.repo.findByListId(listId, filters, pagination, tx);
  }

  /**
   * Returns an item by id, scoped to the owning user.
   * @param userId - Owning user's UUID
   * @param id - Item's UUID
   * @param tx - Optional transaction client
   */
  findByIdForUser(userId: string, id: string, tx?: DbTransactionClient): Promise<TodoItem | null> {
    return this.repo.findByIdForUser(userId, id, tx);
  }

  /**
   * Patches an item by id (ownership pre-verified).
   * @param id - Item's UUID
   * @param patch - Fields to update
   * @param tx - Optional transaction client
   */
  updateById(
    id: string,
    patch: Partial<{
      title: string;
      description: string | null;
      status: TodoStatus;
      priority: TodoPriority;
      dueDate: Date | null;
      completedAt: Date | null;
    }>,
    tx?: DbTransactionClient,
  ): Promise<TodoItem> {
    return this.repo.updateById(id, patch, tx);
  }

  /**
   * Soft-deletes an item by id.
   * @param id - Item's UUID
   * @param tx - Optional transaction client
   */
  softDeleteById(id: string, tx?: DbTransactionClient): Promise<TodoItem> {
    return this.repo.softDeleteById(id, tx);
  }

  /**
   * Assigns a tag to an item.
   * @param itemId - TodoItem UUID
   * @param tagId - Tag UUID
   * @param tx - Optional transaction client
   */
  assignTag(itemId: string, tagId: string, tx?: DbTransactionClient): Promise<TodoItemTag> {
    return this.repo.assignTag(itemId, tagId, tx);
  }

  /**
   * Removes a tag from an item.
   * @param itemId - TodoItem UUID
   * @param tagId - Tag UUID
   * @param tx - Optional transaction client
   */
  removeTag(itemId: string, tagId: string, tx?: DbTransactionClient): Promise<TodoItemTag> {
    return this.repo.removeTag(itemId, tagId, tx);
  }
}
