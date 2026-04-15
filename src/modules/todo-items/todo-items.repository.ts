import { Injectable } from '@nestjs/common';
import { Prisma, TodoItem, TodoStatus, TodoPriority } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { BaseRepository } from '@database/repositories/base.repository';
import { PaginationParams, PaginatedResult } from '@common/interfaces';

export interface TodoItemFilters {
  status?: TodoStatus;
  priority?: TodoPriority;
  dueDate?: string;
  tagId?: string;
  overdue?: boolean;
}

export type TodoItemWithTags = TodoItem & {
  tags: { tag: { id: string; name: string; color: string | null } }[];
};

/**
 * Repository for TodoItem model operations.
 */
@Injectable()
export class TodoItemsRepository extends BaseRepository<
  TodoItem,
  Prisma.TodoItemCreateInput,
  Prisma.TodoItemUpdateInput,
  Prisma.TodoItemWhereUniqueInput,
  Prisma.TodoItemWhereInput,
  Prisma.TodoItemOrderByWithRelationInput
> {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  protected get delegate() {
    return this.prisma.todoItem;
  }

  /**
   * Finds paginated todo items for a given list, with optional filters.
   */
  async findByListId(
    listId: string,
    filters: TodoItemFilters,
    params: PaginationParams,
  ): Promise<PaginatedResult<TodoItem>> {
    const where: Prisma.TodoItemWhereInput = {
      todoListId: listId,
      deletedAt: null,
    };

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.priority) {
      where.priority = filters.priority;
    }

    if (filters.dueDate) {
      where.dueDate = { lte: new Date(filters.dueDate) };
    }

    if (filters.overdue) {
      where.dueDate = { lt: new Date() };
      where.status = { notIn: ['COMPLETED', 'ARCHIVED'] };
    }

    if (filters.tagId) {
      where.tags = {
        some: { tagId: filters.tagId },
      } as Prisma.TodoItemTagListRelationFilter;
    }

    return this.findManyPaginated(params, where);
  }

  /**
   * Finds a single todo item by id, including its tags relation.
   */
  async findByIdWithTags(id: string): Promise<TodoItemWithTags | null> {
    return this.prisma.todoItem.findUnique({
      where: { id },
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
      },
    });
  }
}
