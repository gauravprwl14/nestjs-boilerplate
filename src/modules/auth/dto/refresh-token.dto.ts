import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/**
 * DTO for refreshing access tokens.
 */
export class RefreshTokenDto {
  /** The refresh token string */
  @ApiProperty({ description: 'Refresh token obtained during login or previous refresh' })
  @IsString()
  refreshToken!: string;
}
