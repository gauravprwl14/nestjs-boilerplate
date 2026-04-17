import { Injectable } from '@nestjs/common';
import { ApiKey, ApiKeyStatus, Prisma, RefreshToken, User } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { BaseRepository } from '@database/base.repository';
import { DbTransactionClient } from '@database/types';

export type ApiKeyListProjection = Pick<
  ApiKey,
  'id' | 'name' | 'prefix' | 'status' | 'lastUsedAt' | 'expiresAt' | 'createdAt'
>;

/**
 * Repository for RefreshToken + ApiKey. BaseRepository is typed for the
 * primary model (RefreshToken); ApiKey methods are explicit named methods.
 */
@Injectable()
export class AuthCredentialsDbRepository extends BaseRepository<
  RefreshToken,
  Prisma.RefreshTokenCreateInput,
  Prisma.RefreshTokenUpdateInput,
  Prisma.RefreshTokenWhereUniqueInput,
  Prisma.RefreshTokenWhereInput,
  Prisma.RefreshTokenOrderByWithRelationInput
> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  protected delegateFor(client: PrismaService | DbTransactionClient) {
    return client.refreshToken;
  }

  // ─── Refresh tokens ──────────────────────────────────────────────

  /**
   * Issues a new refresh token for a user.
   *
   * @param input - Token value, owning user id, and expiry
   * @param tx - Optional transaction client
   * @returns The created RefreshToken record
   */
  async issueRefreshToken(
    input: { token: string; userId: string; expiresAt: Date },
    tx?: DbTransactionClient,
  ): Promise<RefreshToken> {
    return this.client(tx).refreshToken.create({ data: input });
  }

  /**
   * Finds a refresh token by its value, eagerly loading the owning user.
   *
   * @param token - The raw refresh token string
   * @param tx - Optional transaction client
   * @returns The RefreshToken with its user, or null if not found
   */
  async findRefreshTokenByValueWithUser(
    token: string,
    tx?: DbTransactionClient,
  ): Promise<(RefreshToken & { user: User }) | null> {
    return this.client(tx).refreshToken.findUnique({
      where: { token },
      include: { user: true },
    }) as Promise<(RefreshToken & { user: User }) | null>;
  }

  /**
   * Revokes a single refresh token by id.
   *
   * @param id - The refresh token's UUID
   * @param tx - Optional transaction client
   * @returns The updated RefreshToken record
   */
  async revokeRefreshToken(id: string, tx?: DbTransactionClient): Promise<RefreshToken> {
    return this.client(tx).refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Revokes every non-revoked refresh token for a user.
   *
   * @param userId - The user's UUID
   * @param tx - Optional transaction client
   * @returns Batch result with count of revoked tokens
   */
  async revokeAllActiveRefreshTokensForUser(
    userId: string,
    tx?: DbTransactionClient,
  ): Promise<{ count: number }> {
    return this.client(tx).refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // ─── API keys ────────────────────────────────────────────────────

  /**
   * Creates a new API key in ACTIVE status.
   *
   * @param userId - The owning user's UUID
   * @param input - Key name, hash, prefix, and optional expiry
   * @param tx - Optional transaction client
   * @returns The created ApiKey record
   */
  async createApiKey(
    userId: string,
    input: { name: string; keyHash: string; prefix: string; expiresAt?: Date | null },
    tx?: DbTransactionClient,
  ): Promise<ApiKey> {
    return this.client(tx).apiKey.create({
      data: {
        name: input.name,
        keyHash: input.keyHash,
        prefix: input.prefix,
        userId,
        status: ApiKeyStatus.ACTIVE,
        expiresAt: input.expiresAt ?? null,
      },
    });
  }

  /**
   * Lists a user's API keys without the raw hash.
   *
   * @param userId - The owning user's UUID
   * @param tx - Optional transaction client
   * @returns Array of API key list projections ordered by createdAt desc
   */
  async findApiKeysByUserId(
    userId: string,
    tx?: DbTransactionClient,
  ): Promise<ApiKeyListProjection[]> {
    return this.client(tx).apiKey.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        prefix: true,
        status: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Finds a single API key scoped to its owning user.
   *
   * @param userId - The owning user's UUID
   * @param keyId - The API key's UUID
   * @param tx - Optional transaction client
   * @returns The ApiKey record or null if not found for this user
   */
  async findApiKeyByIdForUser(
    userId: string,
    keyId: string,
    tx?: DbTransactionClient,
  ): Promise<ApiKey | null> {
    return this.client(tx).apiKey.findFirst({
      where: { id: keyId, userId },
    });
  }

  /**
   * Revokes an API key by flipping its status to REVOKED.
   *
   * @param keyId - The API key's UUID
   * @param tx - Optional transaction client
   * @returns The updated ApiKey record
   */
  async revokeApiKey(keyId: string, tx?: DbTransactionClient): Promise<ApiKey> {
    return this.client(tx).apiKey.update({
      where: { id: keyId },
      data: { status: ApiKeyStatus.REVOKED },
    });
  }

  /**
   * Finds an API key by its SHA-256 hash, eagerly loading the owning user.
   * Used by the Passport API key strategy during authentication.
   *
   * @param keyHash - The SHA-256 hash of the incoming raw key
   * @param tx - Optional transaction client
   * @returns The ApiKey with its owning user, or null if the hash does not match
   */
  async findApiKeyByHashWithUser(
    keyHash: string,
    tx?: DbTransactionClient,
  ): Promise<(ApiKey & { user: User }) | null> {
    return this.client(tx).apiKey.findUnique({
      where: { keyHash },
      include: { user: true },
    }) as Promise<(ApiKey & { user: User }) | null>;
  }

  /**
   * Stamps `lastUsedAt` on an API key to the current timestamp.
   * Fire-and-forget from the Passport strategy — non-blocking by design.
   *
   * @param keyId - The API key's UUID
   * @param tx - Optional transaction client
   * @returns The updated ApiKey record
   */
  async touchApiKeyLastUsed(keyId: string, tx?: DbTransactionClient): Promise<ApiKey> {
    return this.client(tx).apiKey.update({
      where: { id: keyId },
      data: { lastUsedAt: new Date() },
    });
  }
}
