import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Tag, TodoItemTag } from '@prisma/client';
import { TagsService } from './tags.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ApiAuth } from '@common/decorators/api-auth.decorator';

/**
 * Controller for tag operations and assigning/removing tags from todo items.
 * All routes are JWT-protected via the global JwtAuthGuard.
 */
@ApiTags('Tags')
@ApiAuth()
@Controller()
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Post('tags')
  @ApiOperation({ summary: 'Create a new tag' })
  @ApiResponse({ status: 201, description: 'Tag created successfully' })
  @ApiResponse({ status: 409, description: 'Tag name already exists' })
  async create(@Body() dto: CreateTagDto): Promise<Tag> {
    return this.tagsService.create(dto);
  }

  @Get('tags')
  @ApiOperation({ summary: 'Get all tags' })
  @ApiResponse({ status: 200, description: 'Tags returned successfully' })
  async findAll(): Promise<Tag[]> {
    return this.tagsService.findAll();
  }

  @Post('todo-items/:id/tags/:tagId')
  @ApiOperation({ summary: 'Assign a tag to a todo item' })
  @ApiResponse({ status: 201, description: 'Tag assigned successfully' })
  @ApiResponse({ status: 404, description: 'Todo item or tag not found' })
  async assignToItem(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) itemId: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
  ): Promise<TodoItemTag> {
    return this.tagsService.assignToItem(userId, itemId, tagId);
  }

  @Delete('todo-items/:id/tags/:tagId')
  @ApiOperation({ summary: 'Remove a tag from a todo item' })
  @ApiResponse({ status: 200, description: 'Tag removed successfully' })
  @ApiResponse({ status: 404, description: 'Todo item not found' })
  async removeFromItem(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) itemId: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
  ): Promise<TodoItemTag> {
    return this.tagsService.removeFromItem(userId, itemId, tagId);
  }
}
