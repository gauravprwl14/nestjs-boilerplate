import { Injectable } from '@nestjs/common';
import { Prisma, User, UserStatus } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { BaseRepository } from '@database/repositories/base.repository';

/**
 * Repository for User model operations.
 * Extends BaseRepository providing standard CRUD and adds user-specific queries.
 */
@Injectable()
export class UsersRepository extends BaseRepository<
  User,
  Prisma.UserCreateInput,
  Prisma.UserUpdateInput,
  Prisma.UserWhereUniqueInput,
  Prisma.UserWhereInput,
  Prisma.UserOrderByWithRelationInput
> {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /** Returns the Prisma user delegate. */
  protected get delegate() {
    return this.prisma.user;
  }

  /**
   * Finds an active (non-deleted) user by email address.
   * @param email - The email address to look up
   * @returns The matching user or null
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: {
        email,
        deletedAt: null,
      },
    });
  }

  /**
   * Finds a user that is active and not soft-deleted by their ID.
   * @param id - The user's UUID
   * @returns The matching user or null
   */
  async findActiveById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
        status: UserStatus.ACTIVE,
      },
    });
  }
}
