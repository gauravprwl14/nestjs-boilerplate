import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

/**
 * DTO for user login.
 */
export class LoginDto {
  /** User email address */
  @ApiProperty({ example: 'user@example.com', description: 'User email address' })
  @IsEmail()
  email!: string;

  /** User password */
  @ApiProperty({ example: 'SecurePass1!', description: 'User password' })
  @IsString()
  password!: string;
}
