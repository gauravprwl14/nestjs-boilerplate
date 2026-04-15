import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

/**
 * DTO for changing user password.
 */
export class ChangePasswordDto {
  /** Current password */
  @ApiProperty({ description: 'Current password for verification' })
  @IsString()
  currentPassword: string;

  /** New password (minimum 8 characters) */
  @ApiProperty({ description: 'New password (minimum 8 characters)', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
