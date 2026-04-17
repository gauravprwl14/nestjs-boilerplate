import { Module } from '@nestjs/common';
import { TodoListsService } from './todo-lists.service';
import { TodoListsController } from './todo-lists.controller';

/**
 * Module for todo list management.
 */
@Module({
  controllers: [TodoListsController],
  providers: [TodoListsService],
  exports: [TodoListsService],
})
export class TodoListsModule {}
