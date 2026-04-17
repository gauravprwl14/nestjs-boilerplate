import { Test, TestingModule } from '@nestjs/testing';
import { TodoPriority, TodoStatus } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { TodoItemsDbRepository } from '@database/todo-items/todo-items.db-repository';
import { createMockPrisma } from '../../../helpers/mock-prisma';

describe('TodoItemsDbRepository', () => {
  let repo: TodoItemsDbRepository;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [TodoItemsDbRepository, { provide: PrismaService, useValue: prisma }],
    }).compile();
    repo = module.get(TodoItemsDbRepository);
  });

  it('createInList connects to the list', async () => {
    prisma.todoItem.create.mockResolvedValue({ id: 'i1' });
    await repo.createInList('l1', {
      title: 't',
      description: 'd',
      priority: TodoPriority.HIGH,
      dueDate: new Date(0),
    });
    expect(prisma.todoItem.create).toHaveBeenCalledWith({
      data: {
        title: 't',
        description: 'd',
        priority: TodoPriority.HIGH,
        dueDate: new Date(0),
        todoList: { connect: { id: 'l1' } },
      },
    });
  });

  it('findByIdForUser scopes via todoList.userId and deletedAt: null', async () => {
    prisma.todoItem.findFirst.mockResolvedValue(null);
    await repo.findByIdForUser('u1', 'i1');
    expect(prisma.todoItem.findFirst).toHaveBeenCalledWith({
      where: { id: 'i1', deletedAt: null, todoList: { userId: 'u1' } },
    });
  });

  it('findByListId applies filters (status, priority, overdue, tagId)', async () => {
    prisma.todoItem.findMany.mockResolvedValue([]);
    prisma.todoItem.count.mockResolvedValue(0);

    await repo.findByListId(
      'l1',
      { status: TodoStatus.PENDING, priority: TodoPriority.HIGH, overdue: true, tagId: 'tag1' },
      { page: 1, limit: 10 },
    );

    expect(prisma.todoItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          todoListId: 'l1',
          deletedAt: null,
          priority: TodoPriority.HIGH,
          dueDate: { lt: expect.any(Date) },
          status: { notIn: ['COMPLETED', 'ARCHIVED'] },
          tags: { some: { tagId: 'tag1' } },
        }),
      }),
    );
  });

  it('assignTag creates a join row', async () => {
    prisma.todoItemTag.create.mockResolvedValue({ todoItemId: 'i1', tagId: 'tag1' });
    await repo.assignTag('i1', 'tag1');
    expect(prisma.todoItemTag.create).toHaveBeenCalledWith({
      data: { todoItemId: 'i1', tagId: 'tag1' },
    });
  });

  it('removeTag deletes the join row via composite key', async () => {
    prisma.todoItemTag.delete.mockResolvedValue({ todoItemId: 'i1', tagId: 'tag1' });
    await repo.removeTag('i1', 'tag1');
    expect(prisma.todoItemTag.delete).toHaveBeenCalledWith({
      where: { todoItemId_tagId: { todoItemId: 'i1', tagId: 'tag1' } },
    });
  });
});
