import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '@modules/auth/auth.service';
import { UsersDbService } from '@database/users/users.db-service';
import { AuthCredentialsDbService } from '@database/auth-credentials/auth-credentials.db-service';
import { AppConfigService } from '@config/config.service';
import { createMockConfig } from '../../helpers/mock-config';
import { createTestUser } from '../../helpers/factories';
import { ErrorException } from '@errors/types/error-exception';
import { faker } from '@faker-js/faker';
import * as bcrypt from 'bcrypt';

const createMockUsersDbService = () => ({
  findActiveByEmail: jest.fn(),
  findById: jest.fn(),
  findActiveById: jest.fn(),
  create: jest.fn(),
  updateProfile: jest.fn(),
  updatePassword: jest.fn(),
  recordFailedLogin: jest.fn(),
  resetFailedLogin: jest.fn(),
});

const createMockAuthCredentialsDbService = () => ({
  issueRefreshToken: jest.fn(),
  findRefreshTokenByValueWithUser: jest.fn(),
  revokeRefreshToken: jest.fn(),
  revokeAllActiveRefreshTokensForUser: jest.fn(),
  createApiKey: jest.fn(),
  findApiKeysByUserId: jest.fn(),
  findApiKeyByIdForUser: jest.fn(),
  revokeApiKey: jest.fn(),
});

const createMockJwtService = () => ({
  sign: jest.fn().mockReturnValue('mock-token'),
  decode: jest.fn().mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 }),
  verify: jest.fn(),
});

describe('AuthService', () => {
  let service: AuthService;
  let mockAuthCredentialsDb: ReturnType<typeof createMockAuthCredentialsDbService>;
  let mockConfig: ReturnType<typeof createMockConfig>;
  let mockUsersDb: ReturnType<typeof createMockUsersDbService>;
  let mockJwtService: ReturnType<typeof createMockJwtService>;

  beforeEach(async () => {
    mockAuthCredentialsDb = createMockAuthCredentialsDbService();
    mockConfig = createMockConfig();
    mockUsersDb = createMockUsersDbService();
    mockJwtService = createMockJwtService();

    // Set up default mock for issueRefreshToken (needed for generateTokens)
    mockAuthCredentialsDb.issueRefreshToken.mockResolvedValue({
      id: faker.string.uuid(),
      token: 'mock-refresh-token',
      userId: faker.string.uuid(),
      expiresAt: new Date(Date.now() + 3600000),
      revokedAt: null,
      createdAt: new Date(),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AppConfigService, useValue: mockConfig },
        { provide: JwtService, useValue: mockJwtService },
        { provide: AuthCredentialsDbService, useValue: mockAuthCredentialsDb },
        { provide: UsersDbService, useValue: mockUsersDb },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register()', () => {
    it('should create user and return tokens for new user', async () => {
      // --- ARRANGE ---
      const dto = {
        email: faker.internet.email(),
        password: 'Password123!',
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
      };
      const mockUser = createTestUser({ email: dto.email, firstName: dto.firstName });

      mockUsersDb.findActiveByEmail.mockResolvedValue(null);
      mockUsersDb.create.mockResolvedValue(mockUser);

      // --- ACT ---
      const result = await service.register(dto);

      // --- ASSERT ---
      expect(result.user).toBeDefined();
      expect(result.tokens).toBeDefined();
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(mockUsersDb.create).toHaveBeenCalled();
    });

    it('should throw uniqueViolation (DAT0003) when email already exists', async () => {
      // --- ARRANGE ---
      const dto = {
        email: faker.internet.email(),
        password: 'Password123!',
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
      };
      const existingUser = createTestUser({ email: dto.email });

      mockUsersDb.findActiveByEmail.mockResolvedValue(existingUser);

      // --- ACT & ASSERT ---
      await expect(service.register(dto)).rejects.toBeInstanceOf(ErrorException);
      await expect(service.register(dto)).rejects.toMatchObject({
        code: 'DAT0003',
        statusCode: 409,
      });
    });
  });

  describe('login()', () => {
    it('should return tokens for valid credentials', async () => {
      // --- ARRANGE ---
      const password = 'ValidPass123!';
      const passwordHash = await bcrypt.hash(password, 4);
      const dto = { email: faker.internet.email(), password };
      const mockUser = createTestUser({ email: dto.email, passwordHash, failedLoginCount: 0 });

      mockUsersDb.findActiveByEmail.mockResolvedValue(mockUser);

      // --- ACT ---
      const result = await service.login(dto);

      // --- ASSERT ---
      expect(result.tokens).toBeDefined();
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.user.email).toBe(dto.email);
    });

    it('should throw invalidCredentials (AUT0006) for wrong password', async () => {
      // --- ARRANGE ---
      const correctPassword = 'CorrectPass123!';
      const passwordHash = await bcrypt.hash(correctPassword, 4);
      const dto = { email: faker.internet.email(), password: 'WrongPass123!' };
      const mockUser = createTestUser({
        email: dto.email,
        passwordHash,
        failedLoginCount: 0,
        status: 'ACTIVE',
      });

      mockUsersDb.findActiveByEmail.mockResolvedValue(mockUser);
      mockUsersDb.recordFailedLogin.mockResolvedValue({ ...mockUser, failedLoginCount: 1 });

      // --- ACT & ASSERT ---
      await expect(service.login(dto)).rejects.toMatchObject({
        code: 'AUT0006',
      });
    });

    it('should throw invalidCredentials when user not found', async () => {
      // --- ARRANGE ---
      const dto = { email: faker.internet.email(), password: 'SomePass123!' };
      mockUsersDb.findActiveByEmail.mockResolvedValue(null);

      // --- ACT & ASSERT ---
      await expect(service.login(dto)).rejects.toMatchObject({
        code: 'AUT0006',
      });
    });

    it('should lock account after 5 failed attempts', async () => {
      // --- ARRANGE ---
      const correctPassword = 'CorrectPass123!';
      const passwordHash = await bcrypt.hash(correctPassword, 4);
      const dto = { email: faker.internet.email(), password: 'WrongPass!' };
      const mockUser = createTestUser({
        email: dto.email,
        passwordHash,
        failedLoginCount: 4, // one more failure will trigger lock
        status: 'ACTIVE',
        lockedUntil: null,
      });

      mockUsersDb.findActiveByEmail.mockResolvedValue(mockUser);
      mockUsersDb.recordFailedLogin.mockResolvedValue({
        ...mockUser,
        failedLoginCount: 5,
        lockedUntil: new Date(Date.now() + 1800000),
      });

      // --- ACT & ASSERT ---
      await expect(service.login(dto)).rejects.toMatchObject({
        code: 'AUT0005', // account locked
      });
      expect(mockUsersDb.recordFailedLogin).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({ lockedUntil: expect.any(Date) }),
      );
    });

    it('should throw accountSuspended (AUT0004) for suspended user', async () => {
      // --- ARRANGE ---
      const dto = { email: faker.internet.email(), password: 'SomePass123!' };
      const mockUser = createTestUser({ email: dto.email, status: 'SUSPENDED' });

      mockUsersDb.findActiveByEmail.mockResolvedValue(mockUser);

      // --- ACT & ASSERT ---
      await expect(service.login(dto)).rejects.toMatchObject({
        code: 'AUT0004',
      });
    });

    it('should throw accountLocked (AUT0005) for locked user', async () => {
      // --- ARRANGE ---
      const dto = { email: faker.internet.email(), password: 'SomePass123!' };
      const lockedUntil = new Date(Date.now() + 1800000); // 30 minutes from now
      const mockUser = createTestUser({ email: dto.email, lockedUntil, status: 'ACTIVE' });

      mockUsersDb.findActiveByEmail.mockResolvedValue(mockUser);

      // --- ACT & ASSERT ---
      await expect(service.login(dto)).rejects.toMatchObject({
        code: 'AUT0005',
      });
    });
  });

  describe('refreshTokens()', () => {
    it('should rotate tokens when given a valid refresh token', async () => {
      // --- ARRANGE ---
      const mockUser = createTestUser();
      const mockRefreshToken = {
        id: faker.string.uuid(),
        token: 'valid-refresh-token',
        userId: mockUser.id,
        expiresAt: new Date(Date.now() + 3600000),
        revokedAt: null,
        user: mockUser,
      };

      mockAuthCredentialsDb.findRefreshTokenByValueWithUser.mockResolvedValue(mockRefreshToken);
      mockAuthCredentialsDb.revokeRefreshToken.mockResolvedValue({
        ...mockRefreshToken,
        revokedAt: new Date(),
      });

      // --- ACT ---
      const result = await service.refreshTokens('valid-refresh-token');

      // --- ASSERT ---
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(mockAuthCredentialsDb.revokeRefreshToken).toHaveBeenCalledWith(mockRefreshToken.id);
    });

    it('should throw tokenInvalid (AUT0003) when token not found', async () => {
      // --- ARRANGE ---
      mockAuthCredentialsDb.findRefreshTokenByValueWithUser.mockResolvedValue(null);

      // --- ACT & ASSERT ---
      await expect(service.refreshTokens('invalid-token')).rejects.toMatchObject({
        code: 'AUT0003',
      });
    });

    it('should throw tokenInvalid (AUT0003) when token has been revoked', async () => {
      // --- ARRANGE ---
      const mockRefreshToken = {
        id: faker.string.uuid(),
        token: 'revoked-token',
        userId: faker.string.uuid(),
        expiresAt: new Date(Date.now() + 3600000),
        revokedAt: new Date(), // already revoked
        user: createTestUser(),
      };

      mockAuthCredentialsDb.findRefreshTokenByValueWithUser.mockResolvedValue(mockRefreshToken);

      // --- ACT & ASSERT ---
      await expect(service.refreshTokens('revoked-token')).rejects.toMatchObject({
        code: 'AUT0003',
      });
    });

    it('should throw tokenExpired (AUT0002) when token is expired', async () => {
      // --- ARRANGE ---
      const mockRefreshToken = {
        id: faker.string.uuid(),
        token: 'expired-token',
        userId: faker.string.uuid(),
        expiresAt: new Date(Date.now() - 3600000), // expired 1 hour ago
        revokedAt: null,
        user: createTestUser(),
      };

      mockAuthCredentialsDb.findRefreshTokenByValueWithUser.mockResolvedValue(mockRefreshToken);

      // --- ACT & ASSERT ---
      await expect(service.refreshTokens('expired-token')).rejects.toMatchObject({
        code: 'AUT0002',
      });
    });
  });

  describe('changePassword()', () => {
    it('should change password and revoke all refresh tokens', async () => {
      // --- ARRANGE ---
      const currentPassword = 'CurrentPass123!';
      const newPassword = 'NewPass456!';
      const passwordHash = await bcrypt.hash(currentPassword, 4);
      const userId = faker.string.uuid();
      const mockUser = createTestUser({ id: userId, passwordHash });
      const dto = { currentPassword, newPassword };

      mockUsersDb.findById.mockResolvedValue(mockUser);
      mockUsersDb.updatePassword.mockResolvedValue({ ...mockUser });
      mockAuthCredentialsDb.revokeAllActiveRefreshTokensForUser.mockResolvedValue({ count: 2 });

      // --- ACT ---
      await service.changePassword(userId, dto);

      // --- ASSERT ---
      expect(mockUsersDb.updatePassword).toHaveBeenCalledWith(userId, expect.any(String));
      expect(mockAuthCredentialsDb.revokeAllActiveRefreshTokensForUser).toHaveBeenCalledWith(
        userId,
      );
    });

    it('should throw invalidCredentials (AUT0006) when current password is wrong', async () => {
      // --- ARRANGE ---
      const correctPassword = 'CorrectPass123!';
      const passwordHash = await bcrypt.hash(correctPassword, 4);
      const userId = faker.string.uuid();
      const mockUser = createTestUser({ id: userId, passwordHash });
      const dto = { currentPassword: 'WrongPass!', newPassword: 'NewPass456!' };

      mockUsersDb.findById.mockResolvedValue(mockUser);

      // --- ACT & ASSERT ---
      await expect(service.changePassword(userId, dto)).rejects.toMatchObject({
        code: 'AUT0006',
      });
    });

    it('should throw notFound (DAT0001) when user does not exist', async () => {
      // --- ARRANGE ---
      const userId = faker.string.uuid();
      const dto = { currentPassword: 'OldPass!', newPassword: 'NewPass!' };

      mockUsersDb.findById.mockResolvedValue(null);

      // --- ACT & ASSERT ---
      await expect(service.changePassword(userId, dto)).rejects.toMatchObject({
        code: 'DAT0001',
      });
    });
  });
});
