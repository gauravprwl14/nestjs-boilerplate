/**
 * TweetsDbRepository — tenant-scoped Prisma delegates + raw-SQL timeline.
 *
 * The delegate path is simple (create, createMany). The timeline is raw SQL
 * that bypasses the Prisma tenant-scope extension, so the repository
 * hard-codes `companyId = ${companyId}` in every predicate. The unit test
 * inspects the Prisma.sql tagged-template output: ensuring companyId/userId
 * appear in the expected WHERE predicates and that each visibility branch
 * (author self, COMPANY, DEPARTMENTS, DEPARTMENTS_AND_SUBDEPARTMENTS) is
 * still present.
 */
import { TweetsDbRepository } from '@database/tweets/tweets.db-repository';
import { PrismaService } from '@database/prisma.service';
import { createMockPrisma } from '../../../helpers/mock-prisma';

/** Mirrors the `tenantScoped` getter so tweet/tweetDepartment delegate writes land on our spies. */
const buildPrisma = () => {
  const base = createMockPrisma();
  (base as any).tenantScoped = {
    tweet: base.tweet,
    tweetDepartment: base.tweetDepartment,
  };
  return base;
};

describe('TweetsDbRepository', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let repo: TweetsDbRepository;

  beforeEach(() => {
    prisma = buildPrisma();
    repo = new TweetsDbRepository(prisma as unknown as PrismaService);
  });

  describe('createTweet', () => {
    it('should call delegate.create with a flat data payload', async () => {
      // --- ARRANGE ---
      (prisma.tweet as any).create.mockResolvedValue({ id: 't1' });

      // --- ACT ---
      const out = await repo.createTweet({
        companyId: 'c1',
        authorId: 'u1',
        content: 'hello',
        visibility: 'COMPANY' as any,
      });

      // --- ASSERT ---
      expect(out).toEqual({ id: 't1' });
      expect((prisma.tweet as any).create).toHaveBeenCalledWith({
        data: { companyId: 'c1', authorId: 'u1', content: 'hello', visibility: 'COMPANY' },
      });
    });

    it('should use the tx client when supplied', async () => {
      // --- ARRANGE ---
      const tx = { tweet: { create: jest.fn().mockResolvedValue({ id: 't2' }) } } as any;

      // --- ACT ---
      await repo.createTweet(
        {
          companyId: 'c1',
          authorId: 'u1',
          content: 'hi',
          visibility: 'DEPARTMENTS' as any,
        },
        tx,
      );

      // --- ASSERT ---
      expect(tx.tweet.create).toHaveBeenCalled();
      expect((prisma.tweet as any).create).not.toHaveBeenCalled();
    });
  });

  describe('createTargets', () => {
    it('should short-circuit when given an empty rows array', async () => {
      // --- ACT ---
      await repo.createTargets([]);

      // --- ASSERT --- no delegate call at all.
      expect((prisma.tweetDepartment as any).createMany).not.toHaveBeenCalled();
    });

    it('should call tweetDepartment.createMany with {data, skipDuplicates}', async () => {
      // --- ARRANGE ---
      (prisma.tweetDepartment as any).createMany.mockResolvedValue({ count: 2 });
      const rows = [
        { tweetId: 't1', departmentId: 'd1', companyId: 'c1' },
        { tweetId: 't1', departmentId: 'd2', companyId: 'c1' },
      ];

      // --- ACT ---
      await repo.createTargets(rows);

      // --- ASSERT ---
      expect((prisma.tweetDepartment as any).createMany).toHaveBeenCalledWith({
        data: rows,
        skipDuplicates: true,
      });
    });

    it('should route through the tx client when supplied', async () => {
      // --- ARRANGE ---
      const tx = {
        tweetDepartment: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      } as any;

      // --- ACT ---
      await repo.createTargets([{ tweetId: 't1', departmentId: 'd1', companyId: 'c1' }], tx);

      // --- ASSERT ---
      expect(tx.tweetDepartment.createMany).toHaveBeenCalled();
      expect((prisma.tweetDepartment as any).createMany).not.toHaveBeenCalled();
    });
  });

  describe('findTimelineForUser', () => {
    /** Extracts the captured Prisma.sql object from a $queryRaw spy. */
    const capturedSql = (spy: jest.Mock): { strings: string[]; values: unknown[] } => {
      const arg = spy.mock.calls[0][0];
      return { strings: arg.strings ?? arg.sql ?? [], values: arg.values ?? [] };
    };

    it('should execute $queryRaw and return its rows', async () => {
      // --- ARRANGE ---
      const rows = [
        {
          id: 't1',
          author_id: 'u1',
          content: 'hi',
          visibility: 'COMPANY',
          created_at: new Date(),
        },
      ];
      (prisma as any).$queryRaw.mockResolvedValueOnce(rows);

      // --- ACT ---
      const out = await repo.findTimelineForUser('u1', 'c1', 50);

      // --- ASSERT ---
      expect(out).toBe(rows);
      expect((prisma as any).$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('should bind userId, companyId (multiple times), and limit as parameters', async () => {
      // --- ARRANGE ---
      (prisma as any).$queryRaw.mockResolvedValueOnce([]);

      // --- ACT ---
      await repo.findTimelineForUser('user-42', 'tenant-7', 25);

      // --- ASSERT --- companyId is hard-coded into every predicate; the SQL
      // template binds it at least 3 times (direct-depts filter, ancestor base,
      // ancestor recursive case, outer tweets.company_id filter).
      const { values } = capturedSql((prisma as any).$queryRaw as jest.Mock);
      expect(values).toContain('user-42');
      expect(values).toContain('tenant-7');
      expect(values).toContain(25);
      // companyId appears at least 4 times (user_direct_depts, user_dept_ancestors
      // base, user_dept_ancestors recursive, outer WHERE) — so ≥ 4 in the bind list.
      const tenantCount = values.filter((v: unknown) => v === 'tenant-7').length;
      expect(tenantCount).toBeGreaterThanOrEqual(4);
    });

    it('should emit SQL referencing all four visibility predicates (self + COMPANY + DEPARTMENTS + D_AND_SUB)', async () => {
      // --- ARRANGE ---
      (prisma as any).$queryRaw.mockResolvedValueOnce([]);

      // --- ACT ---
      await repo.findTimelineForUser('u1', 'c1', 10);

      // --- ASSERT ---
      const { strings } = capturedSql((prisma as any).$queryRaw as jest.Mock);
      const sql = strings.join(' ');
      expect(sql).toContain('t.author_id'); // author self-visibility
      expect(sql).toMatch(/'COMPANY'/);
      expect(sql).toMatch(/'DEPARTMENTS'/);
      expect(sql).toMatch(/'DEPARTMENTS_AND_SUBDEPARTMENTS'/);
      // Recursive CTE climbs parents via user_dept_ancestors.
      expect(sql).toContain('user_dept_ancestors');
      expect(sql).toContain('user_direct_depts');
      // Newest-first + limit
      expect(sql).toMatch(/ORDER BY[\s\n]+t\.created_at[\s\n]+DESC/i);
      expect(sql).toMatch(/LIMIT/i);
    });

    it('should use the tx client when supplied', async () => {
      // --- ARRANGE ---
      const tx = { $queryRaw: jest.fn().mockResolvedValueOnce([]) } as any;

      // --- ACT ---
      await repo.findTimelineForUser('u1', 'c1', 10, tx);

      // --- ASSERT ---
      expect(tx.$queryRaw).toHaveBeenCalled();
      expect((prisma as any).$queryRaw).not.toHaveBeenCalled();
    });
  });
});
