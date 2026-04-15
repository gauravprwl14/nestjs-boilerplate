import { Injectable } from '@nestjs/common';
import { TodoList } from '@prisma/client';
import { TodoListsRepository } from './todo-lists.repository';
import { CreateTodoListDto } from './dto/create-todo-list.dto';
import { UpdateTodoListDto } from './dto/update-todo-list.dto';
import { PaginationParams, PaginatedResult } from '@common/interfaces';
import { ErrorFactory } from '@errors/types/error-factory';

/**
 * Service for todo list business logic.
 */
@Injectable()
export class TodoListsService {
  constructor(private readonly todoListsRepository: TodoListsRepository) {}

  /**
   * Creates a new todo list for the given user.
   */
  async create(userId: string, dto: CreateTodoListDto): Promise<TodoList> {
    return this.todoListsRepository.create({
      title: dto.title,
      description: dto.description,
      user: { connect: { id: userId } },
    });
  }

  /**
   * Returns a paginated list of todo lists for the given user (excludes soft-deleted).
   */
  async findAll(userId: string, params: PaginationParams): Promise<PaginatedResult<TodoList>> {
    return this.todoListsRepository.findByUserId(userId, params);
  }

  /**
   * Returns a single todo list by id, verifying it belongs to the given user.
   */
  async findOne(userId: string, id: string): Promise<TodoList> {
    const list = await this.todoListsRepository.findFirst({
      id,
      userId,
      deletedAt: null,
    });

    if (!list) {
      throw ErrorFactory.notFound('TodoList', id);
    }

    return list;
  }

  /**
   * Updates a todo list after verifying ownership.
   */
  async update(userId: string, id: string, dto: UpdateTodoListDto): Promise<TodoList> {
    await this.findOne(userId, id);
    return this.todoListsRepository.update({ id }, dto);
  }

  /**
   * Soft-deletes a todo list after verifying ownership.
   */
  async remove(userId: string, id: string): Promise<TodoList> {
    await this.findOne(userId, id);
    return this.todoListsRepository.softDelete({ id });
  }
}
