import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MinLength, IsOptional } from 'class-validator';

export class CreateTagDto {
  @ApiProperty({ description: 'Name of the tag', minLength: 1 })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ description: 'Optional hex color for the tag (e.g. #FF5733)' })
  @IsOptional()
  @IsString()
  color?: string;
}
