import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { User, UserStatus } from '@prisma/client';
import { AppConfigService } from '@config/config.service';
import { UsersDbService } from '@database/users/users.db-service';
import { ErrorException } from '@errors/types/error-exception';
import { AUT } from '@errors/error-codes';

/** Shape of the JWT access token payload */
export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  type: string;
  jti: string;
}

/**
 * Passport strategy for validating JWT Bearer tokens.
 *
 * Extracts the token from the Authorization header, verifies it using
 * the configured access secret, then looks up the user in the database
 * and performs additional validation checks (status, lock).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly config: AppConfigService,
    private readonly usersDb: UsersDbService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.auth.jwtAccessSecret,
    });
  }

  /**
   * Validates the decoded JWT payload and returns the user.
   * Called automatically by Passport after token signature verification.
   *
   * @param payload - Decoded JWT payload
   * @returns The authenticated user object
   */
  async validate(payload: JwtPayload): Promise<User> {
    if (payload.type !== 'access') {
      throw new ErrorException(AUT.TOKEN_INVALID);
    }

    const user = await this.usersDb.findById(payload.sub);

    if (!user || user.deletedAt) {
      throw new ErrorException(AUT.TOKEN_INVALID);
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new ErrorException(AUT.ACCOUNT_SUSPENDED);
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ErrorException(AUT.ACCOUNT_LOCKED);
    }

    return user;
  }
}
