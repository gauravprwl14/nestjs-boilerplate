import { Injectable } from '@nestjs/common';
import { Prisma, User, UserStatus } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { BaseRepository } from '@database/base.repository';
import { DbTransactionClient } from '@database/types';

/**
 * Repository for the User model. Only file outside src/database that touches
 * Prisma's user delegate.
 */
@Injectable()
export class UsersDbRepository extends BaseRepository<
  User,
  Prisma.UserCreateInput,
  Prisma.UserUpdateInput,
  Prisma.UserWhereUniqueInput,
  Prisma.UserWhereInput,
  Prisma.UserOrderByWithRelationInput
> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  protected delegateFor(client: PrismaService | DbTransactionClient) {
    return client.user;
  }

  protected supportsSoftDelete = true;

  /**
   * Finds a non-deleted user by email.
   * @param email - The email address to look up
   * @param tx - Optional transaction client
   * @returns The matching user or null
   */
  async findActiveByEmail(email: string, tx?: DbTransactionClient): Promise<User | null> {
    return this.client(tx).user.findFirst({ where: { email, deletedAt: null } });
  }

  /**
   * Finds a non-deleted, ACTIVE user by id.
   * @param id - The user's UUID
   * @param tx - Optional transaction client
   * @returns The matching user or null
   */
  async findActiveById(id: string, tx?: DbTransactionClient): Promise<User | null> {
    return this.client(tx).user.findFirst({
      where: { id, deletedAt: null, status: UserStatus.ACTIVE },
    });
  }

  /**
   * Records a failed login attempt and (optionally) locks the account.
   * @param id - The user's UUID
   * @param patch - Failed count and optional lock timestamp
   * @param tx - Optional transaction client
   * @returns The updated user
   */
  async recordFailedLogin(
    id: string,
    patch: { count: number; lockedUntil?: Date | null },
    tx?: DbTransactionClient,
  ): Promise<User> {
    return this.client(tx).user.update({
      where: { id },
      data: {
        failedLoginCount: patch.count,
        ...(patch.lockedUntil !== undefined ? { lockedUntil: patch.lockedUntil } : {}),
      },
    });
  }

  /**
   * Zeroes the failed-login counter and clears the lock.
   * @param id - The user's UUID
   * @param tx - Optional transaction client
   * @returns The updated user
   */
  async resetFailedLogin(id: string, tx?: DbTransactionClient): Promise<User> {
    return this.client(tx).user.update({
      where: { id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  }

  /**
   * Updates profile fields (firstName/lastName).
   * @param id - The user's UUID
   * @param patch - Fields to update
   * @param tx - Optional transaction client
   * @returns The updated user
   */
  async updateProfile(
    id: string,
    patch: { firstName?: string | null; lastName?: string | null },
    tx?: DbTransactionClient,
  ): Promise<User> {
    return this.client(tx).user.update({ where: { id }, data: patch });
  }

  /**
   * Updates just the password hash.
   * @param id - The user's UUID
   * @param passwordHash - The new bcrypt hash
   * @param tx - Optional transaction client
   * @returns The updated user
   */
  async updatePassword(id: string, passwordHash: string, tx?: DbTransactionClient): Promise<User> {
    return this.client(tx).user.update({ where: { id }, data: { passwordHash } });
  }

  /**
   * Finds a user by id regardless of status or deletedAt.
   * @param id - The user's UUID
   * @param tx - Optional transaction client
   * @returns The matching user or null
   */
  async findById(id: string, tx?: DbTransactionClient): Promise<User | null> {
    return this.client(tx).user.findUnique({ where: { id } });
  }

  /**
   * Creates a user from a plain input shape.
   * @param input - User creation fields
   * @param tx - Optional transaction client
   * @returns The created user
   */
  async createUser(
    input: {
      email: string;
      passwordHash: string;
      firstName?: string | null;
      lastName?: string | null;
      status?: UserStatus;
    },
    tx?: DbTransactionClient,
  ): Promise<User> {
    return this.client(tx).user.create({ data: input });
  }
}
