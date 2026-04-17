import { MockAuthMiddleware } from '@common/middleware/mock-auth.middleware';
import { ClsKey } from '@common/cls/cls.constants';
import { ErrorException } from '@errors/types/error-exception';

describe('MockAuthMiddleware', () => {
  const cls = { set: jest.fn() } as any;
  const usersDb = { findAuthContext: jest.fn() } as any;
  const mw = new MockAuthMiddleware(cls, usersDb);

  const next = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const buildReq = (url: string, headers: Record<string, string | undefined> = {}) => ({
    originalUrl: url,
    headers,
  }) as any;

  it('skips non-/api routes without auth', async () => {
    // Arrange
    const req = buildReq('/docs');
    // Act
    await mw.use(req, {} as any, next);
    // Assert
    expect(next).toHaveBeenCalled();
    expect(cls.set).not.toHaveBeenCalled();
    expect(usersDb.findAuthContext).not.toHaveBeenCalled();
  });

  it('throws AUT0001 when x-user-id is missing', async () => {
    // Arrange
    const req = buildReq('/api/v1/timeline', {});
    // Act + Assert
    await expect(mw.use(req, {} as any, next)).rejects.toBeInstanceOf(ErrorException);
  });

  it('throws AUT0001 when user is unknown', async () => {
    // Arrange
    usersDb.findAuthContext.mockResolvedValueOnce(null);
    const req = buildReq('/api/v1/timeline', { 'x-user-id': 'missing' });
    // Act + Assert
    await expect(mw.use(req, {} as any, next)).rejects.toBeInstanceOf(ErrorException);
  });

  it('populates CLS and req.user on success', async () => {
    // Arrange
    const authCtx = {
      id: 'u1',
      companyId: 'c1',
      email: 'a@b.c',
      name: 'A',
      departmentIds: ['d1', 'd2'],
    };
    usersDb.findAuthContext.mockResolvedValueOnce(authCtx);
    const req = buildReq('/api/v1/timeline', { 'x-user-id': 'u1' });
    // Act
    await mw.use(req, {} as any, next);
    // Assert
    expect(cls.set).toHaveBeenCalledWith(ClsKey.USER_ID, 'u1');
    expect(cls.set).toHaveBeenCalledWith(ClsKey.COMPANY_ID, 'c1');
    expect(cls.set).toHaveBeenCalledWith(ClsKey.USER_DEPARTMENT_IDS, ['d1', 'd2']);
    expect((req as any).user).toEqual(authCtx);
    expect(next).toHaveBeenCalled();
  });
});
