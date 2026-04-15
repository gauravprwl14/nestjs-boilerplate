import { Module } from '@nestjs/common';
import { TodoItemsRepository } from './todo-items.repository';
import { TodoItemsService } from './todo-items.service';
import { TodoItemsController } from './todo-items.controller';
import { TodoItemsProcessor } from './todo-items.processor';
import { QueueModule } from '@/queue/queue.module';
import { TodoListsModule } from '@modules/todo-lists/todo-lists.module';

/**
 * Module for todo item management with BullMQ queue support.
 */
@Module({
  imports: [QueueModule, TodoListsModule],
  controllers: [TodoItemsController],
  providers: [TodoItemsRepository, TodoItemsService, TodoItemsProcessor],
  exports: [TodoItemsService, TodoItemsRepository],
})
export class TodoItemsModule {}
