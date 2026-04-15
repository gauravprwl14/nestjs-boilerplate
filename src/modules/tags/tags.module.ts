import { Module } from '@nestjs/common';
import { TagsRepository } from './tags.repository';
import { TagsService } from './tags.service';
import { TagsController } from './tags.controller';
import { TodoItemsModule } from '@modules/todo-items/todo-items.module';

/**
 * Module for tag management and tag-item assignments.
 */
@Module({
  imports: [TodoItemsModule],
  controllers: [TagsController],
  providers: [TagsRepository, TagsService],
  exports: [TagsService, TagsRepository],
})
export class TagsModule {}
