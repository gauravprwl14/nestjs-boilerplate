import { AuthContextGuard } from '@common/guards/auth-context.guard';
import { ErrorException } from '@errors/types/error-exception';

describe('AuthContextGuard', () => {
  const makeCtx = (isPublic = false): any => ({
    getHandler: jest.fn(),
    getClass: jest.fn(),
    __isPublic: isPublic,
  });
  const reflector = { getAllAndOverride: jest.fn() } as any;

  it('allows request when CLS has companyId', () => {
    // Arrange
    const cls = { get: jest.fn().mockReturnValue('c1') } as any;
    reflector.getAllAndOverride.mockReturnValue(false);
    const guard = new AuthContextGuard(cls, reflector);
    // Act + Assert
    expect(guard.canActivate(makeCtx())).toBe(true);
  });

  it('blocks request when CLS has no companyId', () => {
    // Arrange
    const cls = { get: jest.fn().mockReturnValue(undefined) } as any;
    reflector.getAllAndOverride.mockReturnValue(false);
    const guard = new AuthContextGuard(cls, reflector);
    // Act + Assert
    expect(() => guard.canActivate(makeCtx())).toThrow(ErrorException);
  });

  it('allows @Public() routes even without tenant context', () => {
    // Arrange
    const cls = { get: jest.fn().mockReturnValue(undefined) } as any;
    reflector.getAllAndOverride.mockReturnValue(true);
    const guard = new AuthContextGuard(cls, reflector);
    // Act + Assert
    expect(guard.canActivate(makeCtx(true))).toBe(true);
  });
});
