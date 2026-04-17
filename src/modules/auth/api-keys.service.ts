import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { ApiKey } from '@prisma/client';
import { AuthCredentialsDbService } from '@database/auth-credentials/auth-credentials.db-service';
import { API_KEY_PREFIX_LENGTH } from '@common/constants';
import { ErrorException } from '@errors/types/error-exception';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

/** Publicly visible fields of an API key (no raw key) */
export type ApiKeyListItem = Pick<
  ApiKey,
  'id' | 'name' | 'prefix' | 'status' | 'lastUsedAt' | 'expiresAt' | 'createdAt'
>;

/** Result of creating an API key — includes the full key (shown once only) */
export interface CreateApiKeyResult {
  id: string;
  name: string;
  /** Full API key value — display once, not stored */
  key: string;
  prefix: string;
  createdAt: Date;
}

/**
 * Service for managing API keys.
 * Handles creation (with full key shown once), listing, and revocation.
 */
@Injectable()
export class ApiKeysService {
  constructor(private readonly authCredentialsDb: AuthCredentialsDbService) {}

  /**
   * Creates a new API key for a user. The raw key is returned once and never stored.
   *
   * @param userId - The owning user's UUID
   * @param dto - Key creation parameters
   * @returns Key metadata and the raw key value (one-time display)
   */
  async create(userId: string, dto: CreateApiKeyDto): Promise<CreateApiKeyResult> {
    const rawKey = crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const prefix = rawKey.slice(0, API_KEY_PREFIX_LENGTH);

    const apiKey = await this.authCredentialsDb.createApiKey(userId, {
      name: dto.name,
      keyHash,
      prefix,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
    });

    return {
      id: apiKey.id,
      name: apiKey.name,
      key: rawKey,
      prefix: apiKey.prefix,
      createdAt: apiKey.createdAt,
    };
  }

  /**
   * Lists all API keys for a user (without the raw key).
   *
   * @param userId - The owning user's UUID
   * @returns Array of API key metadata
   */
  async findAll(userId: string): Promise<ApiKeyListItem[]> {
    return this.authCredentialsDb.findApiKeysByUserId(userId);
  }

  /**
   * Revokes an API key owned by the specified user.
   *
   * @param userId - The owning user's UUID
   * @param keyId - The API key's UUID
   * @throws {ErrorException} when the key is not found for this user
   */
  async revoke(userId: string, keyId: string): Promise<void> {
    const apiKey = await this.authCredentialsDb.findApiKeyByIdForUser(userId, keyId);
    if (!apiKey) {
      throw ErrorException.notFound('ApiKey', keyId);
    }
    await this.authCredentialsDb.revokeApiKey(keyId);
  }
}
