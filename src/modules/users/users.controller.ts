import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UsersService, SafeUser } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ApiAuth } from '@common/decorators/api-auth.decorator';

/**
 * Controller for user profile operations.
 * All routes require authentication.
 */
@ApiTags('Users')
@ApiAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Returns the profile of the currently authenticated user.
   */
  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Current user profile returned successfully' })
  async getMe(@CurrentUser('id') userId: string): Promise<SafeUser> {
    return this.usersService.getProfile(userId);
  }

  /**
   * Updates firstName and/or lastName of the currently authenticated user.
   */
  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  async updateMe(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateUserDto,
  ): Promise<SafeUser> {
    return this.usersService.updateProfile(userId, dto);
  }
}
