import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MinLength, IsOptional } from 'class-validator';

export class CreateTodoListDto {
  @ApiProperty({ description: 'Title of the todo list', minLength: 1 })
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiPropertyOptional({ description: 'Optional description of the todo list' })
  @IsOptional()
  @IsString()
  description?: string;
}
