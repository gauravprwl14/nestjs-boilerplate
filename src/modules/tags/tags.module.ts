import { Module } from '@nestjs/common';
import { TagsService } from './tags.service';
import { TagsController } from './tags.controller';
import { TodoItemsModule } from '@modules/todo-items/todo-items.module';

/**
 * Module for tag management and tag-item assignments.
 */
@Module({
  imports: [TodoItemsModule],
  controllers: [TagsController],
  providers: [TagsService],
  exports: [TagsService],
})
export class TagsModule {}
