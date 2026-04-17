import { Test, TestingModule } from '@nestjs/testing';
import { TodoListsDbRepository } from '@database/todo-lists/todo-lists.db-repository';
import { TodoListsDbService } from '@database/todo-lists/todo-lists.db-service';

describe('TodoListsDbService', () => {
  let service: TodoListsDbService;
  let repo: jest.Mocked<TodoListsDbRepository>;

  beforeEach(async () => {
    const repoMock: Partial<jest.Mocked<TodoListsDbRepository>> = {
      createForUser: jest.fn(),
      findActiveByUserId: jest.fn(),
      findByIdForUser: jest.fn(),
      updateById: jest.fn(),
      softDeleteById: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [TodoListsDbService, { provide: TodoListsDbRepository, useValue: repoMock }],
    }).compile();
    service = module.get(TodoListsDbService);
    repo = module.get(TodoListsDbRepository);
  });

  it('createForUser delegates', async () => {
    await service.createForUser('u1', { title: 't' });
    expect(repo.createForUser).toHaveBeenCalledWith('u1', { title: 't' }, undefined);
  });
});
