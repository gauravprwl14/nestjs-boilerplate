import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TodoItem, TodoStatus } from '@prisma/client';
import { TodoItemsDbService } from '@database/todo-items/todo-items.db-service';
import { TodoListsService } from '@modules/todo-lists/todo-lists.service';
import { CreateTodoItemDto } from './dto/create-todo-item.dto';
import { UpdateTodoItemDto } from './dto/update-todo-item.dto';
import { QueryTodoItemsDto } from './dto/query-todo-items.dto';
import { VALID_STATUS_TRANSITIONS } from './todo-status.constants';
import { TODO_QUEUE } from '@/queue/queue.module';
import { PaginatedResult } from '@common/interfaces';
import { ErrorException } from '@errors/types/error-exception';
import { VAL } from '@errors/error-codes';

/**
 * Service for todo item business logic, including status transitions
 * and queue jobs.
 */
@Injectable()
export class TodoItemsService {
  constructor(
    private readonly todoItemsDb: TodoItemsDbService,
    private readonly todoListsService: TodoListsService,
    @InjectQueue(TODO_QUEUE) private readonly todoQueue: Queue,
  ) {}

  /**
   * Creates a new todo item in the given list, verifying ownership.
   * If a dueDate is set, enqueues an overdue-check job.
   * @param userId - Owning user's UUID
   * @param listId - TodoList UUID
   * @param dto - Create payload
   */
  async create(userId: string, listId: string, dto: CreateTodoItemDto): Promise<TodoItem> {
    await this.todoListsService.findOne(userId, listId);

    const item = await this.todoItemsDb.createInList(listId, {
      title: dto.title,
      description: dto.description,
      priority: dto.priority,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
    });

    if (dto.dueDate) {
      await this.todoQueue.add(
        'overdue-check',
        { todoItemId: item.id, type: 'overdue-check' },
        { delay: new Date(dto.dueDate).getTime() - Date.now(), attempts: 3 },
      );
    }

    return item;
  }

  /**
   * Returns paginated todo items for a given list, verifying ownership.
   * @param userId - Owning user's UUID
   * @param listId - TodoList UUID
   * @param query - Filters and pagination parameters
   */
  async findAll(
    userId: string,
    listId: string,
    query: QueryTodoItemsDto,
  ): Promise<PaginatedResult<TodoItem>> {
    await this.todoListsService.findOne(userId, listId);

    return this.todoItemsDb.findByListId(
      listId,
      {
        status: query.status,
        priority: query.priority,
        tagId: query.tagId,
        overdue: query.overdue,
      },
      {
        page: query.page,
        limit: query.limit,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      },
    );
  }

  /**
   * Returns a single todo item, verifying ownership via list.userId.
   * @param userId - Owning user's UUID
   * @param id - Item's UUID
   * @throws {ErrorException} when the item is not found for this user
   */
  async findOne(userId: string, id: string): Promise<TodoItem> {
    const item = await this.todoItemsDb.findByIdForUser(userId, id);
    if (!item) {
      throw ErrorException.notFound('TodoItem', id);
    }
    return item;
  }

  /**
   * Updates a todo item, validating status transitions if status changes.
   * @param userId - Owning user's UUID
   * @param id - Item's UUID
   * @param dto - Update payload
   * @throws {ErrorException} when transition is invalid or item not found
   */
  async update(userId: string, id: string, dto: UpdateTodoItemDto): Promise<TodoItem> {
    const item = await this.findOne(userId, id);

    if (dto.status && dto.status !== item.status) {
      const allowed = VALID_STATUS_TRANSITIONS[item.status] ?? [];
      if (!allowed.includes(dto.status)) {
        throw new ErrorException(VAL.INVALID_STATUS_TRANSITION, {
          message: `Cannot transition from '${item.status}' to '${dto.status}'`,
        });
      }
    }

    const patch: Parameters<typeof this.todoItemsDb.updateById>[1] = {
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
    };

    if (dto.status === TodoStatus.COMPLETED && item.status !== TodoStatus.COMPLETED) {
      patch.completedAt = new Date();
    }
    if (dto.dueDate !== undefined) {
      patch.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    }

    return this.todoItemsDb.updateById(id, patch);
  }

  /**
   * Soft-deletes a todo item after verifying ownership.
   * @param userId - Owning user's UUID
   * @param id - Item's UUID
   */
  async remove(userId: string, id: string): Promise<TodoItem> {
    await this.findOne(userId, id);
    return this.todoItemsDb.softDeleteById(id);
  }
}
