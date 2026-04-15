import { PartialType } from '@nestjs/swagger';
import { IsOptional, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TodoStatus } from '@prisma/client';
import { CreateTodoItemDto } from './create-todo-item.dto';

export class UpdateTodoItemDto extends PartialType(CreateTodoItemDto) {
  @ApiPropertyOptional({ enum: TodoStatus, description: 'New status for the todo item' })
  @IsOptional()
  @IsEnum(TodoStatus)
  status?: TodoStatus;
}
