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
import { TodoList } from '@prisma/client';
import { TodoListsService } from './todo-lists.service';
import { CreateTodoListDto } from './dto/create-todo-list.dto';
import { UpdateTodoListDto } from './dto/update-todo-list.dto';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { PaginationParams, PaginatedResult } from '@common/interfaces';

/**
 * Controller for todo list CRUD operations.
 * All routes are JWT-protected via the global JwtAuthGuard.
 */
@ApiTags('Todo Lists')
@ApiAuth()
@Controller('todo-lists')
export class TodoListsController {
  constructor(private readonly todoListsService: TodoListsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new todo list' })
  @ApiResponse({ status: 201, description: 'Todo list created successfully' })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateTodoListDto,
  ): Promise<TodoList> {
    return this.todoListsService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all todo lists for the current user' })
  @ApiResponse({ status: 200, description: 'Todo lists returned successfully' })
  async findAll(
    @CurrentUser('id') userId: string,
    @Query() params: PaginationParams,
  ): Promise<PaginatedResult<TodoList>> {
    return this.todoListsService.findAll(userId, params);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single todo list by id' })
  @ApiResponse({ status: 200, description: 'Todo list returned successfully' })
  @ApiResponse({ status: 404, description: 'Todo list not found' })
  async findOne(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TodoList> {
    return this.todoListsService.findOne(userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a todo list' })
  @ApiResponse({ status: 200, description: 'Todo list updated successfully' })
  @ApiResponse({ status: 404, description: 'Todo list not found' })
  async update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTodoListDto,
  ): Promise<TodoList> {
    return this.todoListsService.update(userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a todo list' })
  @ApiResponse({ status: 200, description: 'Todo list deleted successfully' })
  @ApiResponse({ status: 404, description: 'Todo list not found' })
  async remove(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TodoList> {
    return this.todoListsService.remove(userId, id);
  }
}
