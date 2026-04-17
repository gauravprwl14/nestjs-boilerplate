/**
 * TweetsDbService — orchestrates createTweet + createTargets atomically
 * via DatabaseService.runInTransaction, and forwards findTimelineForUser.
 *
 * We verify:
 *   - COMPANY-visibility path: createTweet called, createTargets NOT called.
 *   - Department-visibility path: createTweet + createTargets called with
 *     rows stamped with tweet.id and companyId; both run inside a single tx.
 *   - findTimelineForUser delegates to the repo (with tx when provided).
 */
import { TweetsDbService } from '@database/tweets/tweets.db-service';

describe('TweetsDbService', () => {
  const repo = {
    createTweet: jest.fn(),
    createTargets: jest.fn(),
    findTimelineForUser: jest.fn(),
  } as any;

  const database = {
    // Captures the callback so we can inspect/invoke the transactional block.
    runInTransaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ tx: true })),
  } as any;

  const service = new TweetsDbService(repo, database);

  beforeEach(() => {
    jest.clearAllMocks();
    database.runInTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ tx: true }),
    );
  });

  describe('createWithTargets', () => {
    it('should create a COMPANY tweet without writing any target rows', async () => {
      // --- ARRANGE ---
      repo.createTweet.mockResolvedValueOnce({ id: 't1' });

      // --- ACT ---
      const out = await service.createWithTargets({
        companyId: 'c1',
        authorId: 'u1',
        content: 'hi',
        visibility: 'COMPANY' as any,
        departmentIds: [],
      });

      // --- ASSERT ---
      expect(out).toEqual({ id: 't1' });
      expect(database.runInTransaction).toHaveBeenCalledTimes(1);
      expect(repo.createTweet).toHaveBeenCalledWith(
        {
          companyId: 'c1',
          authorId: 'u1',
          content: 'hi',
          visibility: 'COMPANY',
        },
        { tx: true },
      );
      expect(repo.createTargets).not.toHaveBeenCalled();
    });

    it('should write one pivot row per departmentId stamped with tweet.id and companyId', async () => {
      // --- ARRANGE ---
      repo.createTweet.mockResolvedValueOnce({ id: 't2' });
      repo.createTargets.mockResolvedValueOnce(undefined);

      // --- ACT ---
      const out = await service.createWithTargets({
        companyId: 'c1',
        authorId: 'u1',
        content: 'hey',
        visibility: 'DEPARTMENTS' as any,
        departmentIds: ['d1', 'd2'],
      });

      // --- ASSERT ---
      expect(out).toEqual({ id: 't2' });
      expect(repo.createTargets).toHaveBeenCalledWith(
        [
          { tweetId: 't2', departmentId: 'd1', companyId: 'c1' },
          { tweetId: 't2', departmentId: 'd2', companyId: 'c1' },
        ],
        { tx: true },
      );
    });

    it('should run both writes inside the same runInTransaction callback', async () => {
      // --- ARRANGE ---
      repo.createTweet.mockResolvedValueOnce({ id: 't3' });

      // --- ACT ---
      await service.createWithTargets({
        companyId: 'c1',
        authorId: 'u1',
        content: 'x',
        visibility: 'DEPARTMENTS_AND_SUBDEPARTMENTS' as any,
        departmentIds: ['d1'],
      });

      // --- ASSERT --- exactly one transaction; both ops received the same tx marker.
      expect(database.runInTransaction).toHaveBeenCalledTimes(1);
      expect(repo.createTweet.mock.calls[0][1]).toEqual({ tx: true });
      expect(repo.createTargets.mock.calls[0][1]).toEqual({ tx: true });
    });

    it('should propagate errors thrown from createTargets and abort the transaction', async () => {
      // --- ARRANGE ---
      repo.createTweet.mockResolvedValueOnce({ id: 't4' });
      repo.createTargets.mockRejectedValueOnce(new Error('targets exploded'));

      // --- ACT + ASSERT ---
      await expect(
        service.createWithTargets({
          companyId: 'c1',
          authorId: 'u1',
          content: 'x',
          visibility: 'DEPARTMENTS' as any,
          departmentIds: ['d1'],
        }),
      ).rejects.toThrow('targets exploded');
    });
  });

  describe('findTimelineForUser', () => {
    it('should forward (userId, companyId, limit, tx) to the repo', async () => {
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
      repo.findTimelineForUser.mockResolvedValueOnce(rows);
      const tx = {} as any;

      // --- ACT ---
      const out = await service.findTimelineForUser('u1', 'c1', 50, tx);

      // --- ASSERT ---
      expect(out).toBe(rows);
      expect(repo.findTimelineForUser).toHaveBeenCalledWith('u1', 'c1', 50, tx);
    });

    it('should pass undefined for tx when caller does not provide one', async () => {
      // --- ARRANGE ---
      repo.findTimelineForUser.mockResolvedValueOnce([]);

      // --- ACT ---
      await service.findTimelineForUser('u1', 'c1', 10);

      // --- ASSERT ---
      expect(repo.findTimelineForUser).toHaveBeenCalledWith('u1', 'c1', 10, undefined);
    });
  });
});
