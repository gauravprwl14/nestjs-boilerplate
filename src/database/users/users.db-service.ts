import { Injectable } from '@nestjs/common';
import { User, UserStatus } from '@prisma/client';
import { UsersDbRepository } from '@database/users/users.db-repository';
import { DbTransactionClient } from '@database/types';

/**
 * DB-layer service for the User aggregate. Only file outside src/database
 * that can reach User. Feature services (UsersService, AuthService) inject
 * this instead of a repository.
 */
@Injectable()
export class UsersDbService {
  constructor(private readonly repo: UsersDbRepository) {}

  /**
   * Finds a user by id regardless of status or deletedAt.
   * @param id - The user's UUID
   * @param tx - Optional transaction client
   * @returns The matching user or null
   */
  findById(id: string, tx?: DbTransactionClient): Promise<User | null> {
    return this.repo.findById(id, tx);
  }

  /**
   * Finds a non-deleted user by email.
   * @param email - The email address to look up
   * @param tx - Optional transaction client
   * @returns The matching user or null
   */
  findActiveByEmail(email: string, tx?: DbTransactionClient): Promise<User | null> {
    return this.repo.findActiveByEmail(email, tx);
  }

  /**
   * Finds a non-deleted, ACTIVE user by id.
   * @param id - The user's UUID
   * @param tx - Optional transaction client
   * @returns The matching user or null
   */
  findActiveById(id: string, tx?: DbTransactionClient): Promise<User | null> {
    return this.repo.findActiveById(id, tx);
  }

  /**
   * Creates a user from a plain input shape.
   * @param input - User creation fields
   * @param tx - Optional transaction client
   * @returns The created user
   */
  create(
    input: {
      email: string;
      passwordHash: string;
      firstName?: string | null;
      lastName?: string | null;
      status?: UserStatus;
    },
    tx?: DbTransactionClient,
  ): Promise<User> {
    return this.repo.createUser(input, tx);
  }

  /**
   * Updates profile fields (firstName/lastName).
   * @param id - The user's UUID
   * @param patch - Fields to update
   * @param tx - Optional transaction client
   * @returns The updated user
   */
  updateProfile(
    id: string,
    patch: { firstName?: string | null; lastName?: string | null },
    tx?: DbTransactionClient,
  ): Promise<User> {
    return this.repo.updateProfile(id, patch, tx);
  }

  /**
   * Updates just the password hash.
   * @param id - The user's UUID
   * @param passwordHash - The new bcrypt hash
   * @param tx - Optional transaction client
   * @returns The updated user
   */
  updatePassword(id: string, passwordHash: string, tx?: DbTransactionClient): Promise<User> {
    return this.repo.updatePassword(id, passwordHash, tx);
  }

  /**
   * Records a failed login attempt and (optionally) locks the account.
   * @param id - The user's UUID
   * @param patch - Failed count and optional lock timestamp
   * @param tx - Optional transaction client
   * @returns The updated user
   */
  recordFailedLogin(
    id: string,
    patch: { count: number; lockedUntil?: Date | null },
    tx?: DbTransactionClient,
  ): Promise<User> {
    return this.repo.recordFailedLogin(id, patch, tx);
  }

  /**
   * Zeroes the failed-login counter and clears the lock.
   * @param id - The user's UUID
   * @param tx - Optional transaction client
   * @returns The updated user
   */
  resetFailedLogin(id: string, tx?: DbTransactionClient): Promise<User> {
    return this.repo.resetFailedLogin(id, tx);
  }
}
