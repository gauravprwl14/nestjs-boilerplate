import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@database/prisma.service';
import { TodoListsDbRepository } from '@database/todo-lists/todo-lists.db-repository';
import { createMockPrisma } from '../../../helpers/mock-prisma';

describe('TodoListsDbRepository', () => {
  let repo: TodoListsDbRepository;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [TodoListsDbRepository, { provide: PrismaService, useValue: prisma }],
    }).compile();
    repo = module.get(TodoListsDbRepository);
  });

  it('createForUser connects the list to the user', async () => {
    prisma.todoList.create.mockResolvedValue({ id: 'l1' });
    await repo.createForUser('u1', { title: 'T', description: 'D' });
    expect(prisma.todoList.create).toHaveBeenCalledWith({
      data: { title: 'T', description: 'D', user: { connect: { id: 'u1' } } },
    });
  });

  it('findByIdForUser filters by id + userId + non-deleted', async () => {
    prisma.todoList.findFirst.mockResolvedValue({ id: 'l1' });
    await repo.findByIdForUser('u1', 'l1');
    expect(prisma.todoList.findFirst).toHaveBeenCalledWith({
      where: { id: 'l1', userId: 'u1', deletedAt: null },
    });
  });

  it('findActiveByUserId delegates to findManyPaginated with soft-delete filter', async () => {
    prisma.todoList.findMany.mockResolvedValue([]);
    prisma.todoList.count.mockResolvedValue(0);
    await repo.findActiveByUserId('u1', { page: 1, limit: 10 });
    expect(prisma.todoList.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', deletedAt: null } }),
    );
  });

  it('updateById updates by id', async () => {
    prisma.todoList.update.mockResolvedValue({ id: 'l1' });
    await repo.updateById('l1', { title: 'x' });
    expect(prisma.todoList.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { title: 'x' },
    });
  });

  it('softDeleteById sets deletedAt', async () => {
    prisma.todoList.update.mockResolvedValue({ id: 'l1' });
    await repo.softDeleteById('l1');
    expect(prisma.todoList.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { deletedAt: expect.any(Date) },
    });
  });
});
