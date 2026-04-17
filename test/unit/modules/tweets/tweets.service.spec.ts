import { TweetsService } from '@modules/tweets/tweets.service';
import { ClsKey } from '@common/cls/cls.constants';
import { ErrorException } from '@errors/types/error-exception';

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
    it('creates a COMPANY-visibility tweet with no target lookups', async () => {
      // Arrange
      tweetsDb.createWithTargets.mockResolvedValueOnce({ id: 't1' });
      // Act
      await service.create({ content: 'hi', visibility: 'COMPANY' } as any);
      // Assert
      expect(departmentsDb.findExistingIdsInCompany).not.toHaveBeenCalled();
      expect(tweetsDb.createWithTargets).toHaveBeenCalledWith({
        companyId: 'c1',
        authorId: 'u1',
        content: 'hi',
        visibility: 'COMPANY',
        departmentIds: [],
      });
    });

    it('throws VAL0008 when any department id is cross-tenant', async () => {
      // Arrange — only 1 of 2 ids exist in caller's company.
      departmentsDb.findExistingIdsInCompany.mockResolvedValueOnce(['d1']);
      // Act + Assert
      await expect(
        service.create({
          content: 'x',
          visibility: 'DEPARTMENTS',
          departmentIds: ['d1', 'other-tenant-dept'],
        } as any),
      ).rejects.toBeInstanceOf(ErrorException);
      expect(tweetsDb.createWithTargets).not.toHaveBeenCalled();
    });

    it('creates a DEPARTMENTS tweet with flat pivot rows when all ids verify', async () => {
      // Arrange
      departmentsDb.findExistingIdsInCompany.mockResolvedValueOnce(['d1', 'd2']);
      tweetsDb.createWithTargets.mockResolvedValueOnce({ id: 't1' });
      // Act
      await service.create({
        content: 'hi',
        visibility: 'DEPARTMENTS',
        departmentIds: ['d1', 'd2'],
      } as any);
      // Assert
      expect(tweetsDb.createWithTargets).toHaveBeenCalledWith({
        companyId: 'c1',
        authorId: 'u1',
        content: 'hi',
        visibility: 'DEPARTMENTS',
        departmentIds: ['d1', 'd2'],
      });
    });

    it('throws VAL0007 when visibility is department-scoped but no ids passed through', async () => {
      // Arrange — schema normally blocks this; defense-in-depth at the service layer.
      // Act + Assert
      await expect(
        service.create({ content: 'x', visibility: 'DEPARTMENTS', departmentIds: [] } as any),
      ).rejects.toBeInstanceOf(ErrorException);
    });
  });

  describe('timeline', () => {
    it('maps raw rows to camelCase public shape', async () => {
      // Arrange
      tweetsDb.findTimelineForUser.mockResolvedValueOnce([
        {
          id: 't1',
          author_id: 'u2',
          content: 'hi',
          visibility: 'COMPANY',
          created_at: new Date('2026-01-01'),
        },
      ]);
      // Act
      const out = await service.timeline();
      // Assert
      expect(out).toEqual([
        {
          id: 't1',
          authorId: 'u2',
          content: 'hi',
          visibility: 'COMPANY',
          createdAt: new Date('2026-01-01'),
        },
      ]);
      expect(tweetsDb.findTimelineForUser).toHaveBeenCalledWith('u1', 'c1', 100);
    });
  });
});
