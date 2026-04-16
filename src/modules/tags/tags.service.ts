import { Injectable } from '@nestjs/common';
import { Tag, TodoItemTag } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { TagsRepository } from './tags.repository';
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
    private readonly tagsRepository: TagsRepository,
    private readonly todoItemsService: TodoItemsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Creates a new tag. Throws uniqueViolation if the name already exists.
   */
  async create(dto: CreateTagDto): Promise<Tag> {
    const existing = await this.tagsRepository.findFirst({ name: dto.name });
    if (existing) {
      throw new ErrorException(DAT.UNIQUE_VIOLATION, {
        message: 'Unique constraint violation on field: name',
        details: [{ field: 'name', message: 'Value already exists' }],
      });
    }

    return this.tagsRepository.create({
      name: dto.name,
      color: dto.color,
    });
  }

  /**
   * Returns all tags.
   */
  async findAll(): Promise<Tag[]> {
    return this.tagsRepository.findMany();
  }

  /**
   * Assigns a tag to a todo item after verifying item ownership.
   */
  async assignToItem(userId: string, itemId: string, tagId: string): Promise<TodoItemTag> {
    await this.todoItemsService.findOne(userId, itemId);

    const tag = await this.tagsRepository.findUnique({ id: tagId });
    if (!tag) {
      throw ErrorException.notFound('Tag', tagId);
    }

    return this.prisma.todoItemTag.create({
      data: {
        todoItemId: itemId,
        tagId,
      },
    });
  }

  /**
   * Removes a tag from a todo item after verifying item ownership.
   */
  async removeFromItem(userId: string, itemId: string, tagId: string): Promise<TodoItemTag> {
    await this.todoItemsService.findOne(userId, itemId);

    return this.prisma.todoItemTag.delete({
      where: {
        todoItemId_tagId: {
          todoItemId: itemId,
          tagId,
        },
      },
    });
  }
}
