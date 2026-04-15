import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TodoItem } from '@prisma/client';
import { TodoItemsRepository } from './todo-items.repository';
import { TodoListsService } from '@modules/todo-lists/todo-lists.service';
import { CreateTodoItemDto } from './dto/create-todo-item.dto';
import { UpdateTodoItemDto } from './dto/update-todo-item.dto';
import { QueryTodoItemsDto } from './dto/query-todo-items.dto';
import { VALID_STATUS_TRANSITIONS } from './todo-status.constants';
import { TODO_QUEUE } from '@/queue/queue.module';
import { PaginatedResult } from '@common/interfaces';
import { ErrorFactory } from '@errors/types/error-factory';

/**
 * Service for todo item business logic, including status transitions and queue jobs.
 */
@Injectable()
export class TodoItemsService {
  constructor(
    private readonly todoItemsRepository: TodoItemsRepository,
    private readonly todoListsService: TodoListsService,
    @InjectQueue(TODO_QUEUE) private readonly todoQueue: Queue,
  ) {}

  /**
   * Creates a new todo item in the given list, verifying ownership.
   * If a dueDate is set, enqueues an overdue-check job.
   */
  async create(userId: string, listId: string, dto: CreateTodoItemDto): Promise<TodoItem> {
    await this.todoListsService.findOne(userId, listId);

    const item = await this.todoItemsRepository.create({
      title: dto.title,
      description: dto.description,
      priority: dto.priority,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      todoList: { connect: { id: listId } },
    });

    if (dto.dueDate) {
      await this.todoQueue.add(
        'overdue-check',
        { todoItemId: item.id, type: 'overdue-check' },
        {
          delay: new Date(dto.dueDate).getTime() - Date.now(),
          attempts: 3,
        },
      );
    }

    return item;
  }

  /**
   * Returns paginated todo items for a given list, verifying ownership.
   */
  async findAll(
    userId: string,
    listId: string,
    query: QueryTodoItemsDto,
  ): Promise<PaginatedResult<TodoItem>> {
    await this.todoListsService.findOne(userId, listId);

    return this.todoItemsRepository.findByListId(
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
   */
  async findOne(userId: string, id: string): Promise<TodoItem> {
    const item = await this.todoItemsRepository.findFirst({
      id,
      deletedAt: null,
      todoList: { userId },
    });

    if (!item) {
      throw ErrorFactory.notFound('TodoItem', id);
    }

    return item;
  }

  /**
   * Updates a todo item, validating status transitions if status changes.
   */
  async update(userId: string, id: string, dto: UpdateTodoItemDto): Promise<TodoItem> {
    const item = await this.findOne(userId, id);

    if (dto.status && dto.status !== item.status) {
      const allowed = VALID_STATUS_TRANSITIONS[item.status] ?? [];
      if (!allowed.includes(dto.status)) {
        throw ErrorFactory.invalidStatusTransition(item.status, dto.status);
      }
    }

    const updateData: Record<string, unknown> = { ...dto };

    if (dto.status === 'COMPLETED' && item.status !== 'COMPLETED') {
      updateData.completedAt = new Date();
    }

    if (dto.dueDate !== undefined) {
      updateData.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    }

    return this.todoItemsRepository.update({ id }, updateData as Parameters<typeof this.todoItemsRepository.update>[1]);
  }

  /**
   * Soft-deletes a todo item after verifying ownership.
   */
  async remove(userId: string, id: string): Promise<TodoItem> {
    await this.findOne(userId, id);
    return this.todoItemsRepository.softDelete({ id });
  }
}
