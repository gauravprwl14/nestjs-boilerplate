import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { TransformInterceptor } from '@common/interceptors/transform.interceptor';

const ctxWithRequest = (request: Record<string, unknown>): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
    }),
  }) as unknown as ExecutionContext;

const handler = <T>(value: T): CallHandler<T> => ({ handle: () => of(value) });

describe('TransformInterceptor', () => {
  let interceptor: TransformInterceptor<unknown>;

  beforeEach(() => {
    interceptor = new TransformInterceptor();
  });

  it('wraps a scalar/object payload into ApiSuccessResponse shape with requestId', async () => {
    // --- ARRANGE ---
    const ctx = ctxWithRequest({ id: 'req-1' });

    // --- ACT ---
    const out = await firstValueFrom(interceptor.intercept(ctx, handler({ foo: 'bar' })));

    // --- ASSERT ---
    expect(out.success).toBe(true);
    expect(out.data).toEqual({ foo: 'bar' });
    expect(out.requestId).toBe('req-1');
    expect(typeof out.timestamp).toBe('string');
    expect(Number.isNaN(Date.parse(out.timestamp))).toBe(false);
    // No pagination meta on a plain payload
    expect(out.meta).toBeUndefined();
  });

  it('hoists PaginatedResult.meta into the response meta field', async () => {
    // --- ARRANGE ---
    const ctx = ctxWithRequest({ id: 'req-2' });
    const paginated = {
      data: [{ id: 1 }, { id: 2 }],
      meta: {
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    };

    // --- ACT ---
    const out = await firstValueFrom(interceptor.intercept(ctx, handler(paginated)));

    // --- ASSERT ---
    expect(out.data).toEqual(paginated.data);
    expect(out.meta).toEqual(paginated.meta);
    expect(out.requestId).toBe('req-2');
  });

  it('leaves requestId undefined when the request carries none', async () => {
    // --- ARRANGE ---
    const ctx = ctxWithRequest({});

    // --- ACT ---
    const out = await firstValueFrom(interceptor.intercept(ctx, handler('payload')));

    // --- ASSERT ---
    expect(out.requestId).toBeUndefined();
    expect(out.data).toBe('payload');
  });

  it('does not treat a plain object with only a data field as paginated', async () => {
    // --- ARRANGE ---
    const ctx = ctxWithRequest({ id: 'r' });
    const payload = { data: [1, 2, 3] }; // missing meta

    // --- ACT ---
    const out = await firstValueFrom(interceptor.intercept(ctx, handler(payload)));

    // --- ASSERT ---
    expect(out.data).toEqual(payload);
    expect(out.meta).toBeUndefined();
  });
});
