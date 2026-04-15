import { Test, TestingModule } from '@nestjs/testing';
import { TodoListsService } from '@modules/todo-lists/todo-lists.service';
import { TodoListsRepository } from '@modules/todo-lists/todo-lists.repository';
import { createTestTodoList } from '../../helpers/factories';
import { AppError } from '@errors/types/app-error';
import { faker } from '@faker-js/faker';

const createMockTodoListsRepository = () => ({
  create: jest.fn(),
  findByUserId: jest.fn(),
  findFirst: jest.fn(),
  findUnique: jest.fn(),
  findMany: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  softDelete: jest.fn(),
  count: jest.fn(),
});

describe('TodoListsService', () => {
  let service: TodoListsService;
  let mockRepo: ReturnType<typeof createMockTodoListsRepository>;

  beforeEach(async () => {
    mockRepo = createMockTodoListsRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TodoListsService,
        { provide: TodoListsRepository, useValue: mockRepo },
      ],
    }).compile();

    service = module.get<TodoListsService>(TodoListsService);
  });

  describe('create()', () => {
    it('should create a todo list for the user', async () => {
      // --- ARRANGE ---
      const userId = faker.string.uuid();
      const dto = { title: 'My List', description: 'A description' };
      const mockList = createTestTodoList({ userId, title: dto.title });
      mockRepo.create.mockResolvedValue(mockList);

      // --- ACT ---
      const result = await service.create(userId, dto);

      // --- ASSERT ---
      expect(result).toEqual(mockList);
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: dto.title,
          description: dto.description,
          user: { connect: { id: userId } },
        }),
      );
    });
  });

  describe('findAll()', () => {
    it('should return paginated todo lists for user', async () => {
      // --- ARRANGE ---
      const userId = faker.string.uuid();
      const params = { page: 1, limit: 10 };
      const mockLists = [createTestTodoList({ userId }), createTestTodoList({ userId })];
      const paginatedResult = {
        data: mockLists,
        meta: { total: 2, page: 1, limit: 10, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      };
      mockRepo.findByUserId.mockResolvedValue(paginatedResult);

      // --- ACT ---
      const result = await service.findAll(userId, params);

      // --- ASSERT ---
      expect(result).toEqual(paginatedResult);
      expect(mockRepo.findByUserId).toHaveBeenCalledWith(userId, params);
    });
  });

  describe('findOne()', () => {
    it('should return the todo list when owned by user', async () => {
      // --- ARRANGE ---
      const userId = faker.string.uuid();
      const listId = faker.string.uuid();
      const mockList = createTestTodoList({ id: listId, userId });
      mockRepo.findFirst.mockResolvedValue(mockList);

      // --- ACT ---
      const result = await service.findOne(userId, listId);

      // --- ASSERT ---
      expect(result).toEqual(mockList);
      expect(mockRepo.findFirst).toHaveBeenCalledWith({ id: listId, userId, deletedAt: null });
    });

    it('should throw notFound when list does not exist', async () => {
      // --- ARRANGE ---
      const userId = faker.string.uuid();
      const listId = faker.string.uuid();
      mockRepo.findFirst.mockResolvedValue(null);

      // --- ACT & ASSERT ---
      await expect(service.findOne(userId, listId)).rejects.toBeInstanceOf(AppError);
      await expect(service.findOne(userId, listId)).rejects.toMatchObject({
        code: 'DAT0001',
        statusCode: 404,
      });
    });

    it('should throw notFound when list belongs to different user', async () => {
      // --- ARRANGE ---
      const userId = faker.string.uuid();
      const listId = faker.string.uuid();
      // repo returns null when userId doesn't match (the findFirst filters by userId)
      mockRepo.findFirst.mockResolvedValue(null);

      // --- ACT & ASSERT ---
      await expect(service.findOne(userId, listId)).rejects.toMatchObject({
        code: 'DAT0001',
      });
    });
  });

  describe('update()', () => {
    it('should update the todo list after verifying ownership', async () => {
      // --- ARRANGE ---
      const userId = faker.string.uuid();
      const listId = faker.string.uuid();
      const dto = { title: 'Updated title' };
      const existingList = createTestTodoList({ id: listId, userId });
      const updatedList = { ...existingList, title: dto.title };

      mockRepo.findFirst.mockResolvedValue(existingList);
      mockRepo.update.mockResolvedValue(updatedList);

      // --- ACT ---
      const result = await service.update(userId, listId, dto);

      // --- ASSERT ---
      expect(result).toEqual(updatedList);
      expect(mockRepo.update).toHaveBeenCalledWith({ id: listId }, dto);
    });
  });

  describe('remove()', () => {
    it('should soft-delete the todo list after verifying ownership', async () => {
      // --- ARRANGE ---
      const userId = faker.string.uuid();
      const listId = faker.string.uuid();
      const existingList = createTestTodoList({ id: listId, userId });
      const deletedList = { ...existingList, deletedAt: new Date() };

      mockRepo.findFirst.mockResolvedValue(existingList);
      mockRepo.softDelete.mockResolvedValue(deletedList);

      // --- ACT ---
      const result = await service.remove(userId, listId);

      // --- ASSERT ---
      expect(result.deletedAt).not.toBeNull();
      expect(mockRepo.softDelete).toHaveBeenCalledWith({ id: listId });
    });
  });
});
