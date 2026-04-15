import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { User, UserStatus } from '@prisma/client';
import { AppConfigService } from '@config/config.service';
import { PrismaService } from '@database/prisma.service';
import { UsersRepository } from '@modules/users/users.repository';
import { ErrorFactory } from '@errors/types/error-factory';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SafeUser } from '@modules/users/users.service';

/** Maximum failed login attempts before account lock */
const MAX_FAILED_ATTEMPTS = 5;

/** Duration (in minutes) an account remains locked after max failed attempts */
const LOCK_DURATION_MINUTES = 30;

/** Token pair returned on authentication operations */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** Result returned from register and login */
export interface AuthResult {
  user: SafeUser;
  tokens: TokenPair;
}

/**
 * Service handling all authentication operations:
 * register, login, refresh tokens, and change password.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly config: AppConfigService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly usersRepository: UsersRepository,
  ) {}

  /**
   * Registers a new user with the provided credentials.
   * Checks for email uniqueness, hashes password, creates user, generates tokens.
   *
   * @param dto - Registration data
   * @returns User profile and token pair
   */
  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.usersRepository.findByEmail(dto.email);
    if (existing) {
      throw ErrorFactory.uniqueViolation('email');
    }

    const passwordHash = await this.hashPassword(dto.password);

    const user = await this.usersRepository.create({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      status: UserStatus.ACTIVE,
    });

    const tokens = await this.generateTokens(user);
    const { passwordHash: _, ...safeUser } = user;

    return { user: safeUser, tokens };
  }

  /**
   * Authenticates a user with email and password.
   * Tracks failed attempts and locks the account after too many failures.
   *
   * @param dto - Login credentials
   * @returns User profile and token pair
   */
  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.usersRepository.findByEmail(dto.email);

    if (!user) {
      throw ErrorFactory.invalidCredentials();
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw ErrorFactory.accountSuspended();
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw ErrorFactory.accountLocked();
    }

    const passwordValid = await this.comparePassword(dto.password, user.passwordHash);

    if (!passwordValid) {
      const newFailedCount = user.failedLoginCount + 1;

      if (newFailedCount >= MAX_FAILED_ATTEMPTS) {
        const lockedUntil = new Date();
        lockedUntil.setMinutes(lockedUntil.getMinutes() + LOCK_DURATION_MINUTES);

        await this.usersRepository.update(
          { id: user.id },
          { failedLoginCount: newFailedCount, lockedUntil },
        );

        throw ErrorFactory.accountLocked();
      }

      await this.usersRepository.update(
        { id: user.id },
        { failedLoginCount: newFailedCount },
      );

      throw ErrorFactory.invalidCredentials();
    }

    // Reset failed login count on success
    if (user.failedLoginCount > 0 || user.lockedUntil) {
      await this.usersRepository.update(
        { id: user.id },
        { failedLoginCount: 0, lockedUntil: null },
      );
    }

    const tokens = await this.generateTokens(user);
    const { passwordHash: _, ...safeUser } = user;

    return { user: safeUser, tokens };
  }

  /**
   * Rotates a refresh token: validates old token, revokes it, issues new pair.
   *
   * @param token - The current refresh token string
   * @returns New token pair
   */
  async refreshTokens(token: string): Promise<TokenPair> {
    const refreshToken = await this.prisma.refreshToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!refreshToken) {
      throw ErrorFactory.tokenInvalid();
    }

    if (refreshToken.revokedAt) {
      throw ErrorFactory.tokenInvalid();
    }

    if (refreshToken.expiresAt < new Date()) {
      throw ErrorFactory.tokenExpired();
    }

    // Revoke old token (rotation)
    await this.prisma.refreshToken.update({
      where: { id: refreshToken.id },
      data: { revokedAt: new Date() },
    });

    return this.generateTokens((refreshToken as typeof refreshToken & { user: User }).user);
  }

  /**
   * Changes the authenticated user's password.
   * Verifies current password, hashes new one, revokes all existing refresh tokens.
   *
   * @param userId - The user's UUID
   * @param dto - Current and new password
   */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.usersRepository.findUnique({ id: userId });

    if (!user) {
      throw ErrorFactory.notFound('User', userId);
    }

    const isValid = await this.comparePassword(dto.currentPassword, user.passwordHash);
    if (!isValid) {
      throw ErrorFactory.invalidCredentials();
    }

    const newHash = await this.hashPassword(dto.newPassword);

    await this.usersRepository.update({ id: userId }, { passwordHash: newHash });

    // Revoke all refresh tokens for this user
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Generates an access/refresh token pair for a user and stores the refresh token.
   *
   * @param user - The user to generate tokens for
   * @returns Access token and refresh token strings
   */
  async generateTokens(user: User): Promise<TokenPair> {
    const jti = uuidv4();
    const refreshJti = uuidv4();

    const { jwtAccessSecret, jwtAccessExpiration, jwtRefreshSecret, jwtRefreshExpiration } =
      this.config.auth;

    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        type: 'access',
        jti,
      },
      {
        secret: jwtAccessSecret,
        expiresIn: jwtAccessExpiration,
      },
    );

    const refreshToken = this.jwtService.sign(
      {
        sub: user.id,
        type: 'refresh',
        jti: refreshJti,
      },
      {
        secret: jwtRefreshSecret,
        expiresIn: jwtRefreshExpiration,
      },
    );

    // Decode to get expiration time for DB storage
    const decoded = this.jwtService.decode(refreshToken) as { exp: number };
    const expiresAt = new Date(decoded.exp * 1000);

    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  /**
   * Hashes a plaintext password using bcrypt.
   */
  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.config.auth.bcryptRounds);
  }

  /**
   * Compares a plaintext password against a bcrypt hash.
   */
  private async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
