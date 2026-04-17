import { Injectable } from '@nestjs/common';
import { Tag, TodoItemTag } from '@prisma/client';
import { TagsDbService } from '@database/tags/tags.db-service';
import { TodoItemsDbService } from '@database/todo-items/todo-items.db-service';
import { TodoItemsService } from '@modules/todo-items/todo-items.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { ErrorException } from '@errors/types/error-exception';
import { DAT } from '@errors/error-codes';

/**
 * Service for tag business logic, including assigning/removing tags from items.
 */
@Injectable()
export class TagsService {
  constructor(
    private readonly tagsDb: TagsDbService,
    private readonly todoItemsDb: TodoItemsDbService,
    private readonly todoItemsService: TodoItemsService,
  ) {}

  /**
   * Creates a new tag. Throws uniqueViolation if the name already exists.
   * @throws {ErrorException} DAT.UNIQUE_VIOLATION when name already taken
   */
  async create(dto: CreateTagDto): Promise<Tag> {
    const existing = await this.tagsDb.findByName(dto.name);
    if (existing) {
      throw new ErrorException(DAT.UNIQUE_VIOLATION, {
        message: 'Unique constraint violation on field: name',
        details: [{ field: 'name', message: 'Value already exists' }],
      });
    }
    return this.tagsDb.create({ name: dto.name, color: dto.color });
  }

  /**
   * Returns all tags.
   */
  async findAll(): Promise<Tag[]> {
    return this.tagsDb.findAll();
  }

  /**
   * Assigns a tag to a todo item after verifying item ownership.
   * @param userId - Owning user's UUID
   * @param itemId - TodoItem UUID
   * @param tagId - Tag UUID
   * @throws {ErrorException} when the item is not owned or tag does not exist
   */
  async assignToItem(userId: string, itemId: string, tagId: string): Promise<TodoItemTag> {
    await this.todoItemsService.findOne(userId, itemId);
    const tag = await this.tagsDb.findById(tagId);
    if (!tag) {
      throw ErrorException.notFound('Tag', tagId);
    }
    return this.todoItemsDb.assignTag(itemId, tagId);
  }

  /**
   * Removes a tag from a todo item after verifying item ownership.
   * @param userId - Owning user's UUID
   * @param itemId - TodoItem UUID
   * @param tagId - Tag UUID
   */
  async removeFromItem(userId: string, itemId: string, tagId: string): Promise<TodoItemTag> {
    await this.todoItemsService.findOne(userId, itemId);
    return this.todoItemsDb.removeTag(itemId, tagId);
  }
}
