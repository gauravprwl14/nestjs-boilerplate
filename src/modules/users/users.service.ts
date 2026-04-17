import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { UsersDbService } from '@database/users/users.db-service';
import { UpdateUserDto } from './dto/update-user.dto';
import { ErrorException } from '@errors/types/error-exception';

/** User object without the passwordHash field */
export type SafeUser = Omit<User, 'passwordHash'>;

/**
 * Service for user profile management operations.
 */
@Injectable()
export class UsersService {
  constructor(private readonly usersDb: UsersDbService) {}

  /**
   * Returns the profile of a user by ID, excluding the password hash.
   * @param userId - The user's UUID
   * @returns The user profile without passwordHash
   * @throws {ErrorException} when the user is not found
   */
  async getProfile(userId: string): Promise<SafeUser> {
    const user = await this.usersDb.findById(userId);
    if (!user || user.deletedAt) {
      throw ErrorException.notFound('User', userId);
    }
    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }

  /**
   * Updates the profile fields (firstName, lastName) of a user.
   * @param userId - The user's UUID
   * @param dto - Fields to update
   * @returns The updated user profile without passwordHash
   * @throws {ErrorException} when the user is not found
   */
  async updateProfile(userId: string, dto: UpdateUserDto): Promise<SafeUser> {
    const user = await this.usersDb.findById(userId);
    if (!user || user.deletedAt) {
      throw ErrorException.notFound('User', userId);
    }
    const updated = await this.usersDb.updateProfile(userId, {
      firstName: dto.firstName,
      lastName: dto.lastName,
    });
    const { passwordHash: _, ...safeUser } = updated;
    return safeUser;
  }
}
