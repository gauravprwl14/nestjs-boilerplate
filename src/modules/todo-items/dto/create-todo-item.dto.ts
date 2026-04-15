import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MinLength, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { TodoPriority } from '@prisma/client';

export class CreateTodoItemDto {
  @ApiProperty({ description: 'Title of the todo item', minLength: 1 })
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiPropertyOptional({ description: 'Optional description of the todo item' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: TodoPriority, description: 'Priority level of the todo item' })
  @IsOptional()
  @IsEnum(TodoPriority)
  priority?: TodoPriority;

  @ApiPropertyOptional({ description: 'Optional due date (ISO 8601 date string)' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
