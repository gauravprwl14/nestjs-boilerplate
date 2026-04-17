import { Test, TestingModule } from '@nestjs/testing';
import { TodoListsService } from '@modules/todo-lists/todo-lists.service';
import { TodoListsDbService } from '@database/todo-lists/todo-lists.db-service';
import { createTestTodoList } from '../../helpers/factories';
import { ErrorException } from '@errors/types/error-exception';
import { faker } from '@faker-js/faker';

const createMockTodoListsDbService = () => ({
  createForUser: jest.fn(),
  findActiveByUserId: jest.fn(),
  findByIdForUser: jest.fn(),
  updateById: jest.fn(),
  softDeleteById: jest.fn(),
});

describe('TodoListsService', () => {
  let service: TodoListsService;
  let mockDb: ReturnType<typeof createMockTodoListsDbService>;

  beforeEach(async () => {
    mockDb = createMockTodoListsDbService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [TodoListsService, { provide: TodoListsDbService, useValue: mockDb }],
    }).compile();

    service = module.get<TodoListsService>(TodoListsService);
  });

  describe('create()', () => {
    it('should create a todo list for the user', async () => {
      // --- ARRANGE ---
      const userId = faker.string.uuid();
      const dto = { title: 'My List', description: 'A description' };
      const mockList = createTestTodoList({ userId, title: dto.title });
      mockDb.createForUser.mockResolvedValue(mockList);

      // --- ACT ---
      const result = await service.create(userId, dto);

      // --- ASSERT ---
      expect(result).toEqual(mockList);
      expect(mockDb.createForUser).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          title: dto.title,
          description: dto.description,
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
        meta: {
          total: 2,
          page: 1,
          limit: 10,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };
      mockDb.findActiveByUserId.mockResolvedValue(paginatedResult);

      // --- ACT ---
      const result = await service.findAll(userId, params);

      // --- ASSERT ---
      expect(result).toEqual(paginatedResult);
      expect(mockDb.findActiveByUserId).toHaveBeenCalledWith(userId, params);
    });
  });

  describe('findOne()', () => {
    it('should return the todo list when owned by user', async () => {
      // --- ARRANGE ---
      const userId = faker.string.uuid();
      const listId = faker.string.uuid();
      const mockList = createTestTodoList({ id: listId, userId });
      mockDb.findByIdForUser.mockResolvedValue(mockList);

      // --- ACT ---
      const result = await service.findOne(userId, listId);

      // --- ASSERT ---
      expect(result).toEqual(mockList);
      expect(mockDb.findByIdForUser).toHaveBeenCalledWith(userId, listId);
    });

    it('should throw notFound when list does not exist', async () => {
      // --- ARRANGE ---
      const userId = faker.string.uuid();
      const listId = faker.string.uuid();
      mockDb.findByIdForUser.mockResolvedValue(null);

      // --- ACT & ASSERT ---
      await expect(service.findOne(userId, listId)).rejects.toBeInstanceOf(ErrorException);
      await expect(service.findOne(userId, listId)).rejects.toMatchObject({
        code: 'DAT0001',
        statusCode: 404,
      });
    });

    it('should throw notFound when list belongs to different user', async () => {
      // --- ARRANGE ---
      const userId = faker.string.uuid();
      const listId = faker.string.uuid();
      // repo returns null when userId doesn't match (the findByIdForUser filters by userId)
      mockDb.findByIdForUser.mockResolvedValue(null);

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

      mockDb.findByIdForUser.mockResolvedValue(existingList);
      mockDb.updateById.mockResolvedValue(updatedList);

      // --- ACT ---
      const result = await service.update(userId, listId, dto);

      // --- ASSERT ---
      expect(result).toEqual(updatedList);
      expect(mockDb.updateById).toHaveBeenCalledWith(
        listId,
        expect.objectContaining({ title: dto.title }),
      );
    });
  });

  describe('remove()', () => {
    it('should soft-delete the todo list after verifying ownership', async () => {
      // --- ARRANGE ---
      const userId = faker.string.uuid();
      const listId = faker.string.uuid();
      const existingList = createTestTodoList({ id: listId, userId });
      const deletedList = { ...existingList, deletedAt: new Date() };

      mockDb.findByIdForUser.mockResolvedValue(existingList);
      mockDb.softDeleteById.mockResolvedValue(deletedList);

      // --- ACT ---
      const result = await service.remove(userId, listId);

      // --- ASSERT ---
      expect(result.deletedAt).not.toBeNull();
      expect(mockDb.softDeleteById).toHaveBeenCalledWith(listId);
    });
  });
});
