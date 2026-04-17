import { Injectable } from '@nestjs/common';
import { Prisma, TodoItem, TodoItemTag, TodoPriority, TodoStatus } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { BaseRepository } from '@database/base.repository';
import { DbTransactionClient } from '@database/types';
import { PaginationParams, PaginatedResult } from '@common/interfaces';

export interface TodoItemFilters {
  status?: TodoStatus;
  priority?: TodoPriority;
  dueDate?: string;
  tagId?: string;
  overdue?: boolean;
}

/**
 * Repository for the TodoItem + TodoItemTag aggregate. Only file outside
 * src/database that touches Prisma's todoItem and todoItemTag delegates.
 */
@Injectable()
export class TodoItemsDbRepository extends BaseRepository<
  TodoItem,
  Prisma.TodoItemCreateInput,
  Prisma.TodoItemUpdateInput,
  Prisma.TodoItemWhereUniqueInput,
  Prisma.TodoItemWhereInput,
  Prisma.TodoItemOrderByWithRelationInput
> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  protected delegateFor(client: PrismaService | DbTransactionClient) {
    return client.todoItem;
  }

  protected supportsSoftDelete = true;

  /**
   * Creates a new todo item inside the given list.
   * @param listId - Owning TodoList UUID
   * @param input - Item fields (title required; rest optional)
   * @param tx - Optional transaction client
   */
  async createInList(
    listId: string,
    input: {
      title: string;
      description?: string | null;
      priority?: TodoPriority;
      dueDate?: Date | null;
    },
    tx?: DbTransactionClient,
  ): Promise<TodoItem> {
    return this.client(tx).todoItem.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        ...(input.priority ? { priority: input.priority } : {}),
        ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
        todoList: { connect: { id: listId } },
      },
    });
  }

  /**
   * Returns paginated, filtered items for a list. List ownership is
   * pre-verified by the feature service.
   * @param listId - Owning TodoList UUID
   * @param filters - Optional filters (status, priority, dueDate, tagId, overdue)
   * @param pagination - Page/limit/sort parameters
   * @param tx - Optional transaction client
   */
  async findByListId(
    listId: string,
    filters: TodoItemFilters,
    pagination: PaginationParams,
    tx?: DbTransactionClient,
  ): Promise<PaginatedResult<TodoItem>> {
    const where: Prisma.TodoItemWhereInput = {
      todoListId: listId,
      deletedAt: null,
    };

    if (filters.priority) where.priority = filters.priority;
    if (filters.status) where.status = filters.status;
    if (filters.dueDate) where.dueDate = { lte: new Date(filters.dueDate) };
    if (filters.overdue) {
      where.dueDate = { lt: new Date() };
      where.status = { notIn: ['COMPLETED', 'ARCHIVED'] };
    }
    if (filters.tagId) {
      where.tags = {
        some: { tagId: filters.tagId },
      } as Prisma.TodoItemTagListRelationFilter;
    }

    return this.findManyPaginated(pagination, where, undefined, tx);
  }

  /**
   * Returns an item by id, scoped to the owning user via the list relation.
   * @param userId - Owning user's UUID
   * @param id - Item's UUID
   * @param tx - Optional transaction client
   */
  async findByIdForUser(
    userId: string,
    id: string,
    tx?: DbTransactionClient,
  ): Promise<TodoItem | null> {
    return this.client(tx).todoItem.findFirst({
      where: { id, deletedAt: null, todoList: { userId } },
    });
  }

  /**
   * Patches an item by id. Ownership must be pre-verified by the feature service.
   * @param id - Item's UUID
   * @param patch - Fields to update
   * @param tx - Optional transaction client
   */
  async updateById(
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
    return this.client(tx).todoItem.update({ where: { id }, data: patch });
  }

  /**
   * Soft-deletes an item by id.
   * @param id - Item's UUID
   * @param tx - Optional transaction client
   */
  async softDeleteById(id: string, tx?: DbTransactionClient): Promise<TodoItem> {
    return this.client(tx).todoItem.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // ─── TodoItemTag (join table — owned by this aggregate) ──────────

  /**
   * Assigns a tag to an item by creating the join row.
   * @param itemId - TodoItem UUID
   * @param tagId - Tag UUID
   * @param tx - Optional transaction client
   */
  async assignTag(itemId: string, tagId: string, tx?: DbTransactionClient): Promise<TodoItemTag> {
    return this.client(tx).todoItemTag.create({
      data: { todoItemId: itemId, tagId },
    });
  }

  /**
   * Removes a tag from an item by deleting the join row.
   * @param itemId - TodoItem UUID
   * @param tagId - Tag UUID
   * @param tx - Optional transaction client
   */
  async removeTag(itemId: string, tagId: string, tx?: DbTransactionClient): Promise<TodoItemTag> {
    return this.client(tx).todoItemTag.delete({
      where: { todoItemId_tagId: { todoItemId: itemId, tagId } },
    });
  }
}
