import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * DTO for user registration.
 */
export class RegisterDto {
  /** User email address */
  @ApiProperty({ example: 'user@example.com', description: 'User email address' })
  @IsEmail()
  email: string;

  /** User password (minimum 8 characters) */
  @ApiProperty({ example: 'SecurePass1!', description: 'User password (minimum 8 characters)', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  /** Optional first name */
  @ApiPropertyOptional({ example: 'John', description: 'First name' })
  @IsOptional()
  @IsString()
  firstName?: string;

  /** Optional last name */
  @ApiPropertyOptional({ example: 'Doe', description: 'Last name' })
  @IsOptional()
  @IsString()
  lastName?: string;
}
