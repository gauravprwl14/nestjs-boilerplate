import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@database/prisma.service';
import { TagsDbRepository } from '@database/tags/tags.db-repository';
import { createMockPrisma } from '../../../helpers/mock-prisma';

describe('TagsDbRepository', () => {
  let repo: TagsDbRepository;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [TagsDbRepository, { provide: PrismaService, useValue: prisma }],
    }).compile();
    repo = module.get(TagsDbRepository);
  });

  it('findByName delegates to findFirst', async () => {
    prisma.tag.findFirst.mockResolvedValue(null);
    await repo.findByName('work');
    expect(prisma.tag.findFirst).toHaveBeenCalledWith({ where: { name: 'work' } });
  });

  it('findById delegates to findUnique', async () => {
    prisma.tag.findUnique.mockResolvedValue(null);
    await repo.findById('t1');
    expect(prisma.tag.findUnique).toHaveBeenCalledWith({ where: { id: 't1' } });
  });

  it('createTag passes input through', async () => {
    prisma.tag.create.mockResolvedValue({ id: 't1' });
    await repo.createTag({ name: 'n', color: '#fff' });
    expect(prisma.tag.create).toHaveBeenCalledWith({
      data: { name: 'n', color: '#fff' },
    });
  });

  it('findAll returns every tag', async () => {
    prisma.tag.findMany.mockResolvedValue([]);
    await repo.findAll();
    expect(prisma.tag.findMany).toHaveBeenCalledWith({});
  });
});
