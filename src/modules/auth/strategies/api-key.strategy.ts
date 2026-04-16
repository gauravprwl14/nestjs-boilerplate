import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';
import { Request } from 'express';
import * as crypto from 'crypto';
import { User, ApiKeyStatus } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { API_KEY_HEADER } from '@common/constants';
import { ErrorException } from '@errors/types/error-exception';
import { AUT } from '@errors/error-codes';

/**
 * Passport strategy for validating API Key authentication.
 *
 * Extracts the API key from the configured request header, hashes it
 * using SHA-256, looks up the hash in the database, validates the key
 * status and expiry, updates lastUsedAt, and returns the owning user.
 */
@Injectable()
export class ApiKeyStrategy extends PassportStrategy(Strategy, 'api-key') {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Validates the API key extracted from the request header.
   *
   * @param request - The incoming HTTP request
   * @returns The user who owns the valid API key
   */
  async validate(request: Request): Promise<User> {
    const rawKey = request.headers[API_KEY_HEADER] as string | undefined;

    if (!rawKey) {
      throw new ErrorException(AUT.UNAUTHENTICATED, { message: 'API key is missing' });
    }

    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const apiKey = await this.prisma.apiKey.findUnique({
      where: { keyHash },
      include: { user: true },
    });

    if (!apiKey) {
      throw new ErrorException(AUT.UNAUTHENTICATED, { message: 'Invalid API key' });
    }

    if (apiKey.status !== ApiKeyStatus.ACTIVE) {
      throw new ErrorException(AUT.UNAUTHENTICATED, { message: 'API key has been revoked' });
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      throw new ErrorException(AUT.UNAUTHENTICATED, { message: 'API key has expired' });
    }

    // Update lastUsedAt asynchronously — do not await to avoid blocking
    this.prisma.apiKey
      .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {
        // Ignore update errors — non-critical
      });

    return (apiKey as typeof apiKey & { user: User }).user;
  }
}
