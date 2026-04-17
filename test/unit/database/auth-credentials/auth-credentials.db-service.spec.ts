import { Test, TestingModule } from '@nestjs/testing';
import { AuthCredentialsDbRepository } from '@database/auth-credentials/auth-credentials.db-repository';
import { AuthCredentialsDbService } from '@database/auth-credentials/auth-credentials.db-service';

describe('AuthCredentialsDbService', () => {
  let service: AuthCredentialsDbService;
  let repo: jest.Mocked<AuthCredentialsDbRepository>;

  beforeEach(async () => {
    const repoMock: Partial<jest.Mocked<AuthCredentialsDbRepository>> = {
      issueRefreshToken: jest.fn(),
      findRefreshTokenByValueWithUser: jest.fn(),
      revokeRefreshToken: jest.fn(),
      revokeAllActiveRefreshTokensForUser: jest.fn(),
      createApiKey: jest.fn(),
      findApiKeysByUserId: jest.fn(),
      findApiKeyByIdForUser: jest.fn(),
      revokeApiKey: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthCredentialsDbService,
        { provide: AuthCredentialsDbRepository, useValue: repoMock },
      ],
    }).compile();

    service = module.get(AuthCredentialsDbService);
    repo = module.get(AuthCredentialsDbRepository);
  });

  it('issueRefreshToken delegates', async () => {
    await service.issueRefreshToken({ token: 't', userId: 'u1', expiresAt: new Date(0) });
    expect(repo.issueRefreshToken).toHaveBeenCalled();
  });

  it('revokeAllActiveRefreshTokensForUser delegates', async () => {
    repo.revokeAllActiveRefreshTokensForUser.mockResolvedValue({ count: 3 });
    const r = await service.revokeAllActiveRefreshTokensForUser('u1');
    expect(r).toEqual({ count: 3 });
    expect(repo.revokeAllActiveRefreshTokensForUser).toHaveBeenCalledWith('u1', undefined);
  });

  it('createApiKey delegates with userId', async () => {
    await service.createApiKey('u1', { name: 'n', keyHash: 'h', prefix: 'p' });
    expect(repo.createApiKey).toHaveBeenCalledWith(
      'u1',
      { name: 'n', keyHash: 'h', prefix: 'p' },
      undefined,
    );
  });
});
