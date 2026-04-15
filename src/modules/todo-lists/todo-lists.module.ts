import { Module } from '@nestjs/common';
import { TodoListsRepository } from './todo-lists.repository';
import { TodoListsService } from './todo-lists.service';
import { TodoListsController } from './todo-lists.controller';

/**
 * Module for todo list management.
 */
@Module({
  controllers: [TodoListsController],
  providers: [TodoListsRepository, TodoListsService],
  exports: [TodoListsService, TodoListsRepository],
})
export class TodoListsModule {}
