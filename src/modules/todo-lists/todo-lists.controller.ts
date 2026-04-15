import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TodoList } from '@prisma/client';
import { TodoListsService } from './todo-lists.service';
import { CreateTodoListDto } from './dto/create-todo-list.dto';
import { UpdateTodoListDto } from './dto/update-todo-list.dto';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { ApiEndpoint } from '@common/decorators/api-endpoint.decorator';
import { PaginationParams, PaginatedResult } from '@common/interfaces';

/**
 * Controller for todo list CRUD operations.
 * All routes are JWT-protected via the global JwtAuthGuard.
 */
@ApiTags('Todo Lists')
@ApiAuth()
@Controller({ path: 'todo-lists', version: '1' })
export class TodoListsController {
  constructor(private readonly todoListsService: TodoListsService) {}

  @Post()
  @ApiEndpoint({
    summary: 'Create a new todo list',
    successStatus: HttpStatus.CREATED,
    successDescription: 'Todo list created successfully',
    errorResponses: [HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED],
  })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateTodoListDto,
  ): Promise<TodoList> {
    return this.todoListsService.create(userId, dto);
  }

  @Get()
  @ApiEndpoint({
    summary: 'Get all todo lists for the current user',
    successStatus: HttpStatus.OK,
    successDescription: 'Todo lists returned successfully',
    errorResponses: [HttpStatus.UNAUTHORIZED],
  })
  async findAll(
    @CurrentUser('id') userId: string,
    @Query() params: PaginationParams,
  ): Promise<PaginatedResult<TodoList>> {
    return this.todoListsService.findAll(userId, params);
  }

  @Get(':id')
  @ApiEndpoint({
    summary: 'Get a single todo list by id',
    successStatus: HttpStatus.OK,
    successDescription: 'Todo list returned successfully',
    errorResponses: [HttpStatus.UNAUTHORIZED, HttpStatus.NOT_FOUND],
  })
  async findOne(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TodoList> {
    return this.todoListsService.findOne(userId, id);
  }

  @Patch(':id')
  @ApiEndpoint({
    summary: 'Update a todo list',
    successStatus: HttpStatus.OK,
    successDescription: 'Todo list updated successfully',
    errorResponses: [HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED, HttpStatus.NOT_FOUND],
  })
  async update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTodoListDto,
  ): Promise<TodoList> {
    return this.todoListsService.update(userId, id, dto);
  }

  @Delete(':id')
  @ApiEndpoint({
    summary: 'Soft-delete a todo list',
    successStatus: HttpStatus.OK,
    successDescription: 'Todo list deleted successfully',
    errorResponses: [HttpStatus.UNAUTHORIZED, HttpStatus.NOT_FOUND],
  })
  async remove(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TodoList> {
    return this.todoListsService.remove(userId, id);
  }
}
