import { Injectable } from '@nestjs/common';
import { Prisma, TodoList } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { BaseRepository } from '@database/repositories/base.repository';
import { PaginationParams, PaginatedResult } from '@common/interfaces';

/**
 * Repository for TodoList model operations.
 * Extends BaseRepository with user-scoped list queries.
 */
@Injectable()
export class TodoListsRepository extends BaseRepository<
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

  protected get delegate() {
    return this.prisma.todoList;
  }

  /**
   * Finds paginated todo lists belonging to a specific user (excludes soft-deleted).
   */
  async findByUserId(
    userId: string,
    params: PaginationParams,
  ): Promise<PaginatedResult<TodoList>> {
    return this.findManyPaginated(params, {
      userId,
      deletedAt: null,
    } as Prisma.TodoListWhereInput);
  }
}
