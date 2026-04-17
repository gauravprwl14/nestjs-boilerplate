import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { TodoItemsService } from '@modules/todo-items/todo-items.service';
import { TodoItemsDbService } from '@database/todo-items/todo-items.db-service';
import { TodoListsService } from '@modules/todo-lists/todo-lists.service';
import { TODO_QUEUE } from '@/queue/queue.module';
import { createTestTodoItem, createTestTodoList } from '../../helpers/factories';
import { ErrorException } from '@errors/types/error-exception';
import { faker } from '@faker-js/faker';

const createMockTodoItemsDbService = () => ({
  createInList: jest.fn(),
  findByListId: jest.fn(),
  findByIdForUser: jest.fn(),
  updateById: jest.fn(),
  softDeleteById: jest.fn(),
  assignTag: jest.fn(),
  removeTag: jest.fn(),
});

const createMockTodoListsService = () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  findAll: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
});

const createMockQueue = () => ({
  add: jest.fn().mockResolvedValue({}),
});

describe('TodoItemsService', () => {
  let service: TodoItemsService;
  let mockItemsDb: ReturnType<typeof createMockTodoItemsDbService>;
  let mockListsService: ReturnType<typeof createMockTodoListsService>;
  let mockQueue: ReturnType<typeof createMockQueue>;

  beforeEach(async () => {
    mockItemsDb = createMockTodoItemsDbService();
    mockListsService = createMockTodoListsService();
    mockQueue = createMockQueue();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TodoItemsService,
        { provide: TodoItemsDbService, useValue: mockItemsDb },
        { provide: TodoListsService, useValue: mockListsService },
        { provide: getQueueToken(TODO_QUEUE), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<TodoItemsService>(TodoItemsService);
  });

  describe('create()', () => {
    it('should create a todo item after verifying list ownership', async () => {
      // --- ARRANGE ---
      const userId = faker.string.uuid();
      const listId = faker.string.uuid();
      const dto = { title: 'New Task', description: 'Do something' };
      const mockList = createTestTodoList({ id: listId, userId });
      const mockItem = createTestTodoItem({ todoListId: listId, title: dto.title });

      mockListsService.findOne.mockResolvedValue(mockList);
      mockItemsDb.createInList.mockResolvedValue(mockItem);

      // --- ACT ---
      const result = await service.create(userId, listId, dto);

      // --- ASSERT ---
      expect(result).toEqual(mockItem);
      expect(mockListsService.findOne).toHaveBeenCalledWith(userId, listId);
      expect(mockItemsDb.createInList).toHaveBeenCalledWith(
        listId,
        expect.objectContaining({ title: dto.title }),
      );
    });

    it('should enqueue overdue-check job when dueDate is provided', async () => {
      // --- ARRANGE ---
      const userId = faker.string.uuid();
      const listId = faker.string.uuid();
      const dueDate = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now
      const dto = { title: 'Due Task', dueDate };
      const mockList = createTestTodoList({ id: listId, userId });
      const mockItem = createTestTodoItem({ todoListId: listId, dueDate: new Date(dueDate) });

      mockListsService.findOne.mockResolvedValue(mockList);
      mockItemsDb.createInList.mockResolvedValue(mockItem);

      // --- ACT ---
      await service.create(userId, listId, dto);

      // --- ASSERT ---
      expect(mockQueue.add).toHaveBeenCalledWith(
        'overdue-check',
        expect.objectContaining({ todoItemId: mockItem.id }),
        expect.any(Object),
      );
    });

    it('should NOT enqueue job when dueDate is not provided', async () => {
      // --- ARRANGE ---
      const userId = faker.string.uuid();
      const listId = faker.string.uuid();
      const dto = { title: 'No Due Date Task' };
      const mockList = createTestTodoList({ id: listId, userId });
      const mockItem = createTestTodoItem({ todoListId: listId });

      mockListsService.findOne.mockResolvedValue(mockList);
      mockItemsDb.createInList.mockResolvedValue(mockItem);

      // --- ACT ---
      await service.create(userId, listId, dto);

      // --- ASSERT ---
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('update() — status transitions', () => {
    it('should allow valid transition PENDING → IN_PROGRESS', async () => {
      // --- ARRANGE ---
      const userId = faker.string.uuid();
      const item = createTestTodoItem({ status: 'PENDING' });
      const updatedItem = { ...item, status: 'IN_PROGRESS' };

      mockItemsDb.findByIdForUser.mockResolvedValue(item);
      mockItemsDb.updateById.mockResolvedValue(updatedItem);

      // --- ACT ---
      const result = await service.update(userId, item.id as string, {
        status: 'IN_PROGRESS' as never,
      });

      // --- ASSERT ---
      expect(result.status).toBe('IN_PROGRESS');
    });

    it('should reject invalid transition ARCHIVED → PENDING', async () => {
      // --- ARRANGE ---
      const userId = faker.string.uuid();
      const item = createTestTodoItem({ status: 'ARCHIVED' });

      mockItemsDb.findByIdForUser.mockResolvedValue(item);

      // --- ACT & ASSERT ---
      await expect(
        service.update(userId, item.id as string, { status: 'PENDING' as never }),
      ).rejects.toBeInstanceOf(ErrorException);

      await expect(
        service.update(userId, item.id as string, { status: 'PENDING' as never }),
      ).rejects.toMatchObject({
        code: 'VAL0004',
      });
    });

    it('should set completedAt when transitioning to COMPLETED', async () => {
      // --- ARRANGE ---
      const userId = faker.string.uuid();
      const item = createTestTodoItem({ status: 'IN_PROGRESS', completedAt: null });
      const updatedItem = { ...item, status: 'COMPLETED', completedAt: new Date() };

      mockItemsDb.findByIdForUser.mockResolvedValue(item);
      mockItemsDb.updateById.mockResolvedValue(updatedItem);

      // --- ACT ---
      const result = await service.update(userId, item.id as string, {
        status: 'COMPLETED' as never,
      });

      // --- ASSERT ---
      expect(mockItemsDb.updateById).toHaveBeenCalledWith(
        item.id,
        expect.objectContaining({ completedAt: expect.any(Date) }),
      );
      expect(result.status).toBe('COMPLETED');
    });

    it('should allow valid transition IN_PROGRESS → PENDING', async () => {
      // --- ARRANGE ---
      const userId = faker.string.uuid();
      const item = createTestTodoItem({ status: 'IN_PROGRESS' });
      const updatedItem = { ...item, status: 'PENDING' };

      mockItemsDb.findByIdForUser.mockResolvedValue(item);
      mockItemsDb.updateById.mockResolvedValue(updatedItem);

      // --- ACT ---
      const result = await service.update(userId, item.id as string, {
        status: 'PENDING' as never,
      });

      // --- ASSERT ---
      expect(result.status).toBe('PENDING');
    });
  });

  describe('remove()', () => {
    it('should soft-delete the todo item after verifying ownership', async () => {
      // --- ARRANGE ---
      const userId = faker.string.uuid();
      const item = createTestTodoItem();
      const deletedItem = { ...item, deletedAt: new Date() };

      mockItemsDb.findByIdForUser.mockResolvedValue(item);
      mockItemsDb.softDeleteById.mockResolvedValue(deletedItem);

      // --- ACT ---
      const result = await service.remove(userId, item.id as string);

      // --- ASSERT ---
      expect(result.deletedAt).not.toBeNull();
      expect(mockItemsDb.softDeleteById).toHaveBeenCalledWith(item.id);
    });

    it('should throw notFound when item does not exist', async () => {
      // --- ARRANGE ---
      const userId = faker.string.uuid();
      const itemId = faker.string.uuid();

      mockItemsDb.findByIdForUser.mockResolvedValue(null);

      // --- ACT & ASSERT ---
      await expect(service.remove(userId, itemId)).rejects.toMatchObject({
        code: 'DAT0001',
      });
    });
  });
});
