import { Test, TestingModule } from '@nestjs/testing';
import { TagsDbRepository } from '@database/tags/tags.db-repository';
import { TagsDbService } from '@database/tags/tags.db-service';

describe('TagsDbService', () => {
  let service: TagsDbService;
  let repo: jest.Mocked<TagsDbRepository>;

  beforeEach(async () => {
    const repoMock: Partial<jest.Mocked<TagsDbRepository>> = {
      findByName: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      createTag: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [TagsDbService, { provide: TagsDbRepository, useValue: repoMock }],
    }).compile();
    service = module.get(TagsDbService);
    repo = module.get(TagsDbRepository);
  });

  it('create delegates to repo.createTag', async () => {
    await service.create({ name: 'n' });
    expect(repo.createTag).toHaveBeenCalledWith({ name: 'n' }, undefined);
  });
});
