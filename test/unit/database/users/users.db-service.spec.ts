import { Test, TestingModule } from '@nestjs/testing';
import { UsersDbRepository } from '@database/users/users.db-repository';
import { UsersDbService } from '@database/users/users.db-service';

describe('UsersDbService', () => {
  let service: UsersDbService;
  let repo: jest.Mocked<UsersDbRepository>;

  beforeEach(async () => {
    const repoMock: Partial<jest.Mocked<UsersDbRepository>> = {
      findById: jest.fn(),
      findActiveByEmail: jest.fn(),
      findActiveById: jest.fn(),
      createUser: jest.fn(),
      updateProfile: jest.fn(),
      updatePassword: jest.fn(),
      recordFailedLogin: jest.fn(),
      resetFailedLogin: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersDbService, { provide: UsersDbRepository, useValue: repoMock }],
    }).compile();

    service = module.get(UsersDbService);
    repo = module.get(UsersDbRepository);
  });

  it('findById delegates to repo.findById', async () => {
    repo.findById.mockResolvedValue({ id: 'u1' } as never);
    const r = await service.findById('u1');
    expect(repo.findById).toHaveBeenCalledWith('u1', undefined);
    expect(r).toEqual({ id: 'u1' });
  });

  it('updateProfile forwards patch to repo.updateProfile', async () => {
    repo.updateProfile.mockResolvedValue({ id: 'u1' } as never);
    await service.updateProfile('u1', { firstName: 'A' });
    expect(repo.updateProfile).toHaveBeenCalledWith('u1', { firstName: 'A' }, undefined);
  });

  it('create forwards input to repo.createUser', async () => {
    repo.createUser.mockResolvedValue({ id: 'u1' } as never);
    await service.create({ email: 'a@b.c', passwordHash: 'h' });
    expect(repo.createUser).toHaveBeenCalledWith({ email: 'a@b.c', passwordHash: 'h' }, undefined);
  });
});
