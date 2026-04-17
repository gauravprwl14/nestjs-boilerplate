import { Injectable } from '@nestjs/common';
import { TodoList } from '@prisma/client';
import { TodoListsDbService } from '@database/todo-lists/todo-lists.db-service';
import { CreateTodoListDto } from './dto/create-todo-list.dto';
import { UpdateTodoListDto } from './dto/update-todo-list.dto';
import { PaginationParams, PaginatedResult } from '@common/interfaces';
import { ErrorException } from '@errors/types/error-exception';

/**
 * Service for todo list business logic.
 */
@Injectable()
export class TodoListsService {
  constructor(private readonly todoListsDb: TodoListsDbService) {}

  /** Creates a new todo list for the given user. */
  async create(userId: string, dto: CreateTodoListDto): Promise<TodoList> {
    return this.todoListsDb.createForUser(userId, {
      title: dto.title,
      description: dto.description,
    });
  }

  /** Returns a paginated list of todo lists for the given user (excludes soft-deleted). */
  async findAll(userId: string, params: PaginationParams): Promise<PaginatedResult<TodoList>> {
    return this.todoListsDb.findActiveByUserId(userId, params);
  }

  /**
   * Returns a single todo list by id, verifying it belongs to the given user.
   * @throws {ErrorException} when the list is not found for this user
   */
  async findOne(userId: string, id: string): Promise<TodoList> {
    const list = await this.todoListsDb.findByIdForUser(userId, id);
    if (!list) {
      throw ErrorException.notFound('TodoList', id);
    }
    return list;
  }

  /** Updates a todo list after verifying ownership. */
  async update(userId: string, id: string, dto: UpdateTodoListDto): Promise<TodoList> {
    await this.findOne(userId, id);
    return this.todoListsDb.updateById(id, {
      title: dto.title,
      description: dto.description,
    });
  }

  /** Soft-deletes a todo list after verifying ownership. */
  async remove(userId: string, id: string): Promise<TodoList> {
    await this.findOne(userId, id);
    return this.todoListsDb.softDeleteById(id);
  }
}
