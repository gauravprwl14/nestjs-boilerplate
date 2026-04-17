import { Injectable } from '@nestjs/common';
import { ApiKey, RefreshToken, User } from '@prisma/client';
import {
  AuthCredentialsDbRepository,
  ApiKeyListProjection,
} from '@database/auth-credentials/auth-credentials.db-repository';
import { DbTransactionClient } from '@database/types';

export type { ApiKeyListProjection };

/**
 * DB-layer service for RefreshToken + ApiKey. Only file outside src/database
 * that can reach either model; AuthService and ApiKeysService inject this.
 */
@Injectable()
export class AuthCredentialsDbService {
  constructor(private readonly repo: AuthCredentialsDbRepository) {}

  /**
   * Issues a new refresh token for a user.
   *
   * @param input - Token value, owning user id, and expiry
   * @param tx - Optional transaction client
   * @returns The created RefreshToken record
   */
  issueRefreshToken(
    input: { token: string; userId: string; expiresAt: Date },
    tx?: DbTransactionClient,
  ): Promise<RefreshToken> {
    return this.repo.issueRefreshToken(input, tx);
  }

  /**
   * Finds a refresh token by its value, eagerly loading the owning user.
   *
   * @param token - The raw refresh token string
   * @param tx - Optional transaction client
   * @returns The RefreshToken with its user, or null if not found
   */
  findRefreshTokenByValueWithUser(
    token: string,
    tx?: DbTransactionClient,
  ): Promise<(RefreshToken & { user: User }) | null> {
    return this.repo.findRefreshTokenByValueWithUser(token, tx);
  }

  /**
   * Revokes a single refresh token by id.
   *
   * @param id - The refresh token's UUID
   * @param tx - Optional transaction client
   * @returns The updated RefreshToken record
   */
  revokeRefreshToken(id: string, tx?: DbTransactionClient): Promise<RefreshToken> {
    return this.repo.revokeRefreshToken(id, tx);
  }

  /**
   * Revokes every non-revoked refresh token for a user.
   *
   * @param userId - The user's UUID
   * @param tx - Optional transaction client
   * @returns Batch result with count of revoked tokens
   */
  revokeAllActiveRefreshTokensForUser(
    userId: string,
    tx?: DbTransactionClient,
  ): Promise<{ count: number }> {
    return this.repo.revokeAllActiveRefreshTokensForUser(userId, tx);
  }

  /**
   * Creates a new API key in ACTIVE status.
   *
   * @param userId - The owning user's UUID
   * @param input - Key name, hash, prefix, and optional expiry
   * @param tx - Optional transaction client
   * @returns The created ApiKey record
   */
  createApiKey(
    userId: string,
    input: { name: string; keyHash: string; prefix: string; expiresAt?: Date | null },
    tx?: DbTransactionClient,
  ): Promise<ApiKey> {
    return this.repo.createApiKey(userId, input, tx);
  }

  /**
   * Lists a user's API keys without the raw hash.
   *
   * @param userId - The owning user's UUID
   * @param tx - Optional transaction client
   * @returns Array of API key list projections ordered by createdAt desc
   */
  findApiKeysByUserId(userId: string, tx?: DbTransactionClient): Promise<ApiKeyListProjection[]> {
    return this.repo.findApiKeysByUserId(userId, tx);
  }

  /**
   * Finds a single API key scoped to its owning user.
   *
   * @param userId - The owning user's UUID
   * @param keyId - The API key's UUID
   * @param tx - Optional transaction client
   * @returns The ApiKey record or null if not found for this user
   */
  findApiKeyByIdForUser(
    userId: string,
    keyId: string,
    tx?: DbTransactionClient,
  ): Promise<ApiKey | null> {
    return this.repo.findApiKeyByIdForUser(userId, keyId, tx);
  }

  /**
   * Revokes an API key by flipping its status to REVOKED.
   *
   * @param keyId - The API key's UUID
   * @param tx - Optional transaction client
   * @returns The updated ApiKey record
   */
  revokeApiKey(keyId: string, tx?: DbTransactionClient): Promise<ApiKey> {
    return this.repo.revokeApiKey(keyId, tx);
  }

  /**
   * Finds an API key by its SHA-256 hash, eagerly loading the owning user.
   * Used by the Passport API key strategy during authentication.
   *
   * @param keyHash - The SHA-256 hash of the incoming raw key
   * @param tx - Optional transaction client
   * @returns The ApiKey with its owning user, or null if the hash does not match
   */
  findApiKeyByHashWithUser(
    keyHash: string,
    tx?: DbTransactionClient,
  ): Promise<(ApiKey & { user: User }) | null> {
    return this.repo.findApiKeyByHashWithUser(keyHash, tx);
  }

  /**
   * Stamps `lastUsedAt` on an API key to the current timestamp.
   *
   * @param keyId - The API key's UUID
   * @param tx - Optional transaction client
   * @returns The updated ApiKey record
   */
  touchApiKeyLastUsed(keyId: string, tx?: DbTransactionClient): Promise<ApiKey> {
    return this.repo.touchApiKeyLastUsed(keyId, tx);
  }
}
