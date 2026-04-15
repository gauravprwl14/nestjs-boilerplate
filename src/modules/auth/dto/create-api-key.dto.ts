import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

/**
 * DTO for creating an API key.
 */
export class CreateApiKeyDto {
  /** Human-readable name for the API key */
  @ApiProperty({ example: 'My Integration Key', description: 'Human-readable name for the API key' })
  @IsString()
  name: string;

  /** Optional expiration date for the API key */
  @ApiPropertyOptional({ example: '2027-12-31T23:59:59Z', description: 'Optional expiration date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
