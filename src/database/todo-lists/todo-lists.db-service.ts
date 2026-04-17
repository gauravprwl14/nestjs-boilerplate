import { Injectable } from '@nestjs/common';
import { TodoList } from '@prisma/client';
import { TodoListsDbRepository } from '@database/todo-lists/todo-lists.db-repository';
import { DbTransactionClient } from '@database/types';
import { PaginationParams, PaginatedResult } from '@common/interfaces';

/**
 * DB-layer service for the TodoList aggregate. Only file outside
 * src/database that can reach TodoList.
 */
@Injectable()
export class TodoListsDbService {
  constructor(private readonly repo: TodoListsDbRepository) {}

  /**
   * Creates a new todo list owned by the given user.
   * @param userId - Owning user's UUID
   * @param input - Title and optional description
   * @param tx - Optional transaction client
   */
  createForUser(
    userId: string,
    input: { title: string; description?: string | null },
    tx?: DbTransactionClient,
  ): Promise<TodoList> {
    return this.repo.createForUser(userId, input, tx);
  }

  /**
   * Returns paginated non-deleted lists for the given user.
   * @param userId - Owning user's UUID
   * @param pagination - Page/limit/sort parameters
   * @param tx - Optional transaction client
   */
  findActiveByUserId(
    userId: string,
    pagination: PaginationParams,
    tx?: DbTransactionClient,
  ): Promise<PaginatedResult<TodoList>> {
    return this.repo.findActiveByUserId(userId, pagination, tx);
  }

  /**
   * Returns a list scoped to the owning user (null if not owned / not found / soft-deleted).
   * @param userId - Owning user's UUID
   * @param id - List's UUID
   * @param tx - Optional transaction client
   */
  findByIdForUser(userId: string, id: string, tx?: DbTransactionClient): Promise<TodoList | null> {
    return this.repo.findByIdForUser(userId, id, tx);
  }

  /**
   * Patches a list by id. Ownership must be pre-verified by the feature service.
   * @param id - List's UUID
   * @param patch - Fields to update
   * @param tx - Optional transaction client
   */
  updateById(
    id: string,
    patch: { title?: string; description?: string | null },
    tx?: DbTransactionClient,
  ): Promise<TodoList> {
    return this.repo.updateById(id, patch, tx);
  }

  /**
   * Soft-deletes a list by id.
   * @param id - List's UUID
   * @param tx - Optional transaction client
   */
  softDeleteById(id: string, tx?: DbTransactionClient): Promise<TodoList> {
    return this.repo.softDeleteById(id, tx);
  }
}
