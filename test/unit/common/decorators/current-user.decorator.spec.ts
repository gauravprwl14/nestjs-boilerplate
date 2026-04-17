import type { ExecutionContext } from '@nestjs/common';

/**
 * The @CurrentUser() decorator uses createParamDecorator, which does not
 * expose its factory directly. We mock createParamDecorator to capture the
 * factory and exercise its logic like any other pure function.
 */
const capturedFactory: { fn?: (field: string | undefined, ctx: ExecutionContext) => unknown } = {};
jest.mock('@nestjs/common', () => {
  const actual = jest.requireActual('@nestjs/common');
  return {
    ...actual,
    createParamDecorator: (
      factory: (field: string | undefined, ctx: ExecutionContext) => unknown,
    ) => {
      capturedFactory.fn = factory;
      return () => () => undefined;
    },
  };
});

// Import AFTER the mock is installed so the factory is captured.
import '@common/decorators/current-user.decorator';

const mkCtx = (user: unknown): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ user }),
      getResponse: () => ({}),
    }),
  }) as unknown as ExecutionContext;

describe('CurrentUser decorator factory', () => {
  it('returns the full user object when called with no field', () => {
    // --- ARRANGE ---
    const user = { id: 'u1', email: 'a@b.c', companyId: 'c1' };

    // --- ACT ---
    const out = capturedFactory.fn!(undefined, mkCtx(user));

    // --- ASSERT ---
    expect(out).toBe(user);
  });

  it('returns the specific field when a field key is supplied', () => {
    // --- ARRANGE ---
    const user = { id: 'u1', email: 'a@b.c' };

    // --- ACT & ASSERT ---
    expect(capturedFactory.fn!('id', mkCtx(user))).toBe('u1');
    expect(capturedFactory.fn!('email', mkCtx(user))).toBe('a@b.c');
  });

  it('returns null when the request has no user attached', () => {
    // --- ACT ---
    const out = capturedFactory.fn!(undefined, mkCtx(undefined));

    // --- ASSERT ---
    expect(out).toBeNull();
  });

  it('returns undefined when asking for a field that does not exist on user', () => {
    // --- ACT ---
    const out = capturedFactory.fn!('missing', mkCtx({ id: 'u1' }));

    // --- ASSERT ---
    expect(out).toBeUndefined();
  });
});
