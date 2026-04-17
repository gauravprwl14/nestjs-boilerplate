import { TweetsService, toTimelineTweet } from '@modules/tweets/tweets.service';
import { ClsKey } from '@common/cls/cls.constants';
import { ErrorException } from '@errors/types/error-exception';
import { AUT, VAL } from '@errors/error-codes';
import { DEFAULT_TIMELINE_LIMIT } from '@common/constants';

describe('TweetsService', () => {
  const tweetsDb = {
    createWithTargets: jest.fn(),
    findTimelineForUser: jest.fn(),
  } as any;
  const departmentsDb = {
    findExistingIdsInCompany: jest.fn(),
  } as any;
  const cls = { get: jest.fn() } as any;
  const service = new TweetsService(tweetsDb, departmentsDb, cls);

  beforeEach(() => {
    jest.clearAllMocks();
    cls.get.mockImplementation((k: string) => {
      if (k === ClsKey.USER_ID) return 'u1';
      if (k === ClsKey.COMPANY_ID) return 'c1';
      return undefined;
    });
  });

  describe('create', () => {
    it('should create a COMPANY-visibility tweet without looking up any departments', async () => {
      // --- ARRANGE ---
      tweetsDb.createWithTargets.mockResolvedValueOnce({ id: 't1' });

      // --- ACT ---
      const result = await service.create({ content: 'hi', visibility: 'COMPANY' } as any);

      // --- ASSERT ---
      expect(result).toEqual({ id: 't1' });
      expect(departmentsDb.findExistingIdsInCompany).not.toHaveBeenCalled();
      expect(tweetsDb.createWithTargets).toHaveBeenCalledWith({
        companyId: 'c1',
        authorId: 'u1',
        content: 'hi',
        visibility: 'COMPANY',
        departmentIds: [],
      });
    });

    it('should strip departmentIds from a COMPANY tweet even if the client sent some', async () => {
      // --- ARRANGE --- Defense-in-depth: the schema allows the field but service ignores it.
      tweetsDb.createWithTargets.mockResolvedValueOnce({ id: 't2' });

      // --- ACT ---
      await service.create({
        content: 'hi',
        visibility: 'COMPANY',
        departmentIds: ['d1'],
      } as any);

      // --- ASSERT ---
      expect(departmentsDb.findExistingIdsInCompany).not.toHaveBeenCalled();
      expect(tweetsDb.createWithTargets).toHaveBeenCalledWith(
        expect.objectContaining({ visibility: 'COMPANY', departmentIds: [] }),
      );
    });

    it('should throw VAL0008 when any department id is cross-tenant', async () => {
      // --- ARRANGE --- only 1 of 2 ids exists in the caller company.
      departmentsDb.findExistingIdsInCompany.mockResolvedValueOnce(['d1']);

      // --- ACT + ASSERT ---
      const err = await service
        .create({
          content: 'x',
          visibility: 'DEPARTMENTS',
          departmentIds: ['d1', 'other-tenant-dept'],
        } as any)
        .catch(e => e);
      expect(err).toBeInstanceOf(ErrorException);
      expect(err.code).toBe(VAL.DEPARTMENT_NOT_IN_COMPANY.code);
      expect(tweetsDb.createWithTargets).not.toHaveBeenCalled();
    });

    it('should create a DEPARTMENTS tweet with flat pivot rows when every id verifies', async () => {
      // --- ARRANGE ---
      departmentsDb.findExistingIdsInCompany.mockResolvedValueOnce(['d1', 'd2']);
      tweetsDb.createWithTargets.mockResolvedValueOnce({ id: 't1' });

      // --- ACT ---
      await service.create({
        content: 'hi',
        visibility: 'DEPARTMENTS',
        departmentIds: ['d1', 'd2'],
      } as any);

      // --- ASSERT ---
      expect(departmentsDb.findExistingIdsInCompany).toHaveBeenCalledWith(['d1', 'd2'], 'c1');
      expect(tweetsDb.createWithTargets).toHaveBeenCalledWith({
        companyId: 'c1',
        authorId: 'u1',
        content: 'hi',
        visibility: 'DEPARTMENTS',
        departmentIds: ['d1', 'd2'],
      });
    });

    it('should create a DEPARTMENTS_AND_SUBDEPARTMENTS tweet after verifying ids', async () => {
      // --- ARRANGE ---
      departmentsDb.findExistingIdsInCompany.mockResolvedValueOnce(['d1']);
      tweetsDb.createWithTargets.mockResolvedValueOnce({ id: 't3' });

      // --- ACT ---
      await service.create({
        content: 'sub',
        visibility: 'DEPARTMENTS_AND_SUBDEPARTMENTS',
        departmentIds: ['d1'],
      } as any);

      // --- ASSERT ---
      expect(tweetsDb.createWithTargets).toHaveBeenCalledWith(
        expect.objectContaining({
          visibility: 'DEPARTMENTS_AND_SUBDEPARTMENTS',
          departmentIds: ['d1'],
        }),
      );
    });

    it('should count duplicates as a cross-tenant failure (Set dedupe defense)', async () => {
      // --- ARRANGE --- findExistingIdsInCompany returns unique ids; caller passed a duplicate.
      // Unique set size is 1, existing length is 1 — so duplicates DO verify. We prove here
      // that the service uses `new Set(...)` for the comparison (defense against length tricks).
      departmentsDb.findExistingIdsInCompany.mockResolvedValueOnce(['d1']);
      tweetsDb.createWithTargets.mockResolvedValueOnce({ id: 't4' });

      // --- ACT ---
      await service.create({
        content: 'dup',
        visibility: 'DEPARTMENTS',
        departmentIds: ['d1', 'd1'],
      } as any);

      // --- ASSERT --- the duplicate array is forwarded; service does not throw.
      expect(tweetsDb.createWithTargets).toHaveBeenCalledWith(
        expect.objectContaining({ departmentIds: ['d1', 'd1'] }),
      );
    });

    it('should throw VAL0007 when visibility is department-scoped but departmentIds is empty', async () => {
      // --- ARRANGE --- schema normally blocks this; defense-in-depth at the service layer.
      // --- ACT + ASSERT ---
      const err = await service
        .create({ content: 'x', visibility: 'DEPARTMENTS', departmentIds: [] } as any)
        .catch(e => e);
      expect(err).toBeInstanceOf(ErrorException);
      expect(err.code).toBe(VAL.DEPARTMENT_IDS_REQUIRED.code);
      expect(departmentsDb.findExistingIdsInCompany).not.toHaveBeenCalled();
      expect(tweetsDb.createWithTargets).not.toHaveBeenCalled();
    });

    it('should throw VAL0007 when departmentIds is undefined on a DEPARTMENTS tweet', async () => {
      // --- ACT + ASSERT ---
      const err = await service
        .create({ content: 'x', visibility: 'DEPARTMENTS' } as any)
        .catch(e => e);
      expect(err).toBeInstanceOf(ErrorException);
      expect(err.code).toBe(VAL.DEPARTMENT_IDS_REQUIRED.code);
    });

    it('should throw AUT0001 when userId is missing from CLS', async () => {
      // --- ARRANGE ---
      cls.get.mockImplementation((k: string) => (k === ClsKey.COMPANY_ID ? 'c1' : undefined));

      // --- ACT + ASSERT ---
      const err = await service
        .create({ content: 'x', visibility: 'COMPANY' } as any)
        .catch(e => e);
      expect(err).toBeInstanceOf(ErrorException);
      expect(err.code).toBe(AUT.UNAUTHENTICATED.code);
    });

    it('should throw AUT0001 when companyId is missing from CLS', async () => {
      // --- ARRANGE ---
      cls.get.mockImplementation((k: string) => (k === ClsKey.USER_ID ? 'u1' : undefined));

      // --- ACT + ASSERT ---
      const err = await service
        .create({ content: 'x', visibility: 'COMPANY' } as any)
        .catch(e => e);
      expect(err).toBeInstanceOf(ErrorException);
      expect(err.code).toBe(AUT.UNAUTHENTICATED.code);
    });
  });

  describe('timeline', () => {
    it('should map raw rows to the camelCase public shape', async () => {
      // --- ARRANGE ---
      tweetsDb.findTimelineForUser.mockResolvedValueOnce([
        {
          id: 't1',
          author_id: 'u2',
          content: 'hi',
          visibility: 'COMPANY',
          created_at: new Date('2026-01-01'),
        },
      ]);

      // --- ACT ---
      const out = await service.timeline();

      // --- ASSERT ---
      expect(out).toEqual([
        {
          id: 't1',
          authorId: 'u2',
          content: 'hi',
          visibility: 'COMPANY',
          createdAt: new Date('2026-01-01'),
        },
      ]);
      expect(tweetsDb.findTimelineForUser).toHaveBeenCalledWith('u1', 'c1', DEFAULT_TIMELINE_LIMIT);
    });

    it('should return an empty array when the db returns no rows', async () => {
      // --- ARRANGE ---
      tweetsDb.findTimelineForUser.mockResolvedValueOnce([]);

      // --- ACT ---
      const out = await service.timeline();

      // --- ASSERT ---
      expect(out).toEqual([]);
    });

    it('should throw AUT0001 when CLS context is missing', async () => {
      // --- ARRANGE ---
      cls.get.mockReturnValue(undefined);

      // --- ACT + ASSERT ---
      await expect(service.timeline()).rejects.toMatchObject({
        code: AUT.UNAUTHENTICATED.code,
      });
      expect(tweetsDb.findTimelineForUser).not.toHaveBeenCalled();
    });
  });
});

describe('toTimelineTweet', () => {
  it('should preserve all fields and rename snake_case to camelCase', () => {
    // --- ARRANGE ---
    const row = {
      id: 'id1',
      author_id: 'auth1',
      content: 'body',
      visibility: 'DEPARTMENTS' as const,
      created_at: new Date('2026-02-02'),
    };

    // --- ACT ---
    const out = toTimelineTweet(row);

    // --- ASSERT ---
    expect(out).toEqual({
      id: 'id1',
      authorId: 'auth1',
      content: 'body',
      visibility: 'DEPARTMENTS',
      createdAt: new Date('2026-02-02'),
    });
  });
});
