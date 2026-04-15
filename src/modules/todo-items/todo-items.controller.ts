import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TodoItem } from '@prisma/client';
import { TodoItemsService } from './todo-items.service';
import { CreateTodoItemDto } from './dto/create-todo-item.dto';
import { UpdateTodoItemDto } from './dto/update-todo-item.dto';
import { QueryTodoItemsDto } from './dto/query-todo-items.dto';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { PaginatedResult } from '@common/interfaces';

/**
 * Controller for todo item CRUD operations and status transitions.
 * All routes are JWT-protected via the global JwtAuthGuard.
 */
@ApiTags('Todo Items')
@ApiAuth()
@Controller()
export class TodoItemsController {
  constructor(private readonly todoItemsService: TodoItemsService) {}

  @Post('todo-lists/:listId/items')
  @ApiOperation({ summary: 'Create a new todo item in a list' })
  @ApiResponse({ status: 201, description: 'Todo item created successfully' })
  @ApiResponse({ status: 404, description: 'Todo list not found' })
  async create(
    @CurrentUser('id') userId: string,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Body() dto: CreateTodoItemDto,
  ): Promise<TodoItem> {
    return this.todoItemsService.create(userId, listId, dto);
  }

  @Get('todo-lists/:listId/items')
  @ApiOperation({ summary: 'Get all todo items for a list with optional filters' })
  @ApiResponse({ status: 200, description: 'Todo items returned successfully' })
  @ApiResponse({ status: 404, description: 'Todo list not found' })
  async findAll(
    @CurrentUser('id') userId: string,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Query() query: QueryTodoItemsDto,
  ): Promise<PaginatedResult<TodoItem>> {
    return this.todoItemsService.findAll(userId, listId, query);
  }

  @Get('todo-items/:id')
  @ApiOperation({ summary: 'Get a single todo item by id' })
  @ApiResponse({ status: 200, description: 'Todo item returned successfully' })
  @ApiResponse({ status: 404, description: 'Todo item not found' })
  async findOne(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TodoItem> {
    return this.todoItemsService.findOne(userId, id);
  }

  @Patch('todo-items/:id')
  @ApiOperation({ summary: 'Update a todo item (including status transitions)' })
  @ApiResponse({ status: 200, description: 'Todo item updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({ status: 404, description: 'Todo item not found' })
  async update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTodoItemDto,
  ): Promise<TodoItem> {
    return this.todoItemsService.update(userId, id, dto);
  }

  @Delete('todo-items/:id')
  @ApiOperation({ summary: 'Soft-delete a todo item' })
  @ApiResponse({ status: 200, description: 'Todo item deleted successfully' })
  @ApiResponse({ status: 404, description: 'Todo item not found' })
  async remove(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TodoItem> {
    return this.todoItemsService.remove(userId, id);
  }
}
