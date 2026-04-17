import { Injectable } from '@nestjs/common';
import { UsersDbRepository, UserAuthContext } from './users.db-repository';
import { DbTransactionClient } from '@database/types';

/**
 * Public DB surface for the User aggregate.
 * The only consumer right now is MockAuthMiddleware.
 */
@Injectable()
export class UsersDbService {
  constructor(private readonly repo: UsersDbRepository) {}

  /**
   * Loads the auth context (id, companyId, email, name, departmentIds) for a user.
   * Returns null when no such user exists.
   * @param id - User UUID from the x-user-id header
   * @param tx - Optional transaction client
   */
  async findAuthContext(id: string, tx?: DbTransactionClient): Promise<UserAuthContext | null> {
    return this.repo.findAuthContext(id, tx);
  }
}

export type { UserAuthContext };
