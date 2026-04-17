import { Test, TestingModule } from '@nestjs/testing';
import { TodoItemsDbRepository } from '@database/todo-items/todo-items.db-repository';
import { TodoItemsDbService } from '@database/todo-items/todo-items.db-service';

describe('TodoItemsDbService', () => {
  let service: TodoItemsDbService;
  let repo: jest.Mocked<TodoItemsDbRepository>;

  beforeEach(async () => {
    const repoMock: Partial<jest.Mocked<TodoItemsDbRepository>> = {
      createInList: jest.fn(),
      findByListId: jest.fn(),
      findByIdForUser: jest.fn(),
      updateById: jest.fn(),
      softDeleteById: jest.fn(),
      assignTag: jest.fn(),
      removeTag: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [TodoItemsDbService, { provide: TodoItemsDbRepository, useValue: repoMock }],
    }).compile();
    service = module.get(TodoItemsDbService);
    repo = module.get(TodoItemsDbRepository);
  });

  it('createInList delegates', async () => {
    await service.createInList('l1', { title: 't' });
    expect(repo.createInList).toHaveBeenCalledWith('l1', { title: 't' }, undefined);
  });

  it('assignTag delegates', async () => {
    await service.assignTag('i1', 'tag1');
    expect(repo.assignTag).toHaveBeenCalledWith('i1', 'tag1', undefined);
  });
});
