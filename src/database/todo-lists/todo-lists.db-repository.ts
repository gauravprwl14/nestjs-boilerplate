import { Injectable } from '@nestjs/common';
import { Prisma, TodoList } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { BaseRepository } from '@database/base.repository';
import { DbTransactionClient } from '@database/types';
import { PaginationParams, PaginatedResult } from '@common/interfaces';

/**
 * Repository for the TodoList model. Only file outside src/database that
 * touches Prisma's todoList delegate.
 */
@Injectable()
export class TodoListsDbRepository extends BaseRepository<
  TodoList,
  Prisma.TodoListCreateInput,
  Prisma.TodoListUpdateInput,
  Prisma.TodoListWhereUniqueInput,
  Prisma.TodoListWhereInput,
  Prisma.TodoListOrderByWithRelationInput
> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  protected delegateFor(client: PrismaService | DbTransactionClient) {
    return client.todoList;
  }

  protected supportsSoftDelete = true;

  /**
   * Creates a new todo list owned by the given user.
   * @param userId - Owning user's UUID
   * @param input - Title and optional description
   * @param tx - Optional transaction client
   */
  async createForUser(
    userId: string,
    input: { title: string; description?: string | null },
    tx?: DbTransactionClient,
  ): Promise<TodoList> {
    return this.client(tx).todoList.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        user: { connect: { id: userId } },
      },
    });
  }

  /**
   * Returns paginated non-deleted lists for the given user.
   * @param userId - Owning user's UUID
   * @param pagination - Page/limit/sort parameters
   * @param tx - Optional transaction client
   */
  async findActiveByUserId(
    userId: string,
    pagination: PaginationParams,
    tx?: DbTransactionClient,
  ): Promise<PaginatedResult<TodoList>> {
    return this.findManyPaginated(pagination, { userId, deletedAt: null }, undefined, tx);
  }

  /**
   * Returns a list scoped to the owning user (returns null for not-found / not-owned / soft-deleted).
   * @param userId - Owning user's UUID
   * @param id - List's UUID
   * @param tx - Optional transaction client
   */
  async findByIdForUser(
    userId: string,
    id: string,
    tx?: DbTransactionClient,
  ): Promise<TodoList | null> {
    return this.client(tx).todoList.findFirst({
      where: { id, userId, deletedAt: null },
    });
  }

  /**
   * Patches a list by id. Ownership must be pre-verified by the feature service.
   * @param id - List's UUID
   * @param patch - Fields to update
   * @param tx - Optional transaction client
   */
  async updateById(
    id: string,
    patch: { title?: string; description?: string | null },
    tx?: DbTransactionClient,
  ): Promise<TodoList> {
    return this.client(tx).todoList.update({ where: { id }, data: patch });
  }

  /**
   * Soft-deletes a list by id.
   * @param id - List's UUID
   * @param tx - Optional transaction client
   */
  async softDeleteById(id: string, tx?: DbTransactionClient): Promise<TodoList> {
    return this.client(tx).todoList.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
