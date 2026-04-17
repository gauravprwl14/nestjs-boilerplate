import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError, NEVER } from 'rxjs';
import { firstValueFrom, lastValueFrom } from 'rxjs';
import { TimeoutInterceptor } from '@common/interceptors/timeout.interceptor';
import { ErrorException } from '@errors/types/error-exception';
import { DEFAULT_REQUEST_TIMEOUT_MS } from '@common/constants/app.constants';

const ctx = {} as ExecutionContext;

describe('TimeoutInterceptor', () => {
  const interceptor = new TimeoutInterceptor();

  it('passes through a fast response unchanged', async () => {
    // --- ARRANGE ---
    const handler: CallHandler = { handle: () => of('ok') };

    // --- ACT ---
    const result = await firstValueFrom(interceptor.intercept(ctx, handler));

    // --- ASSERT ---
    expect(result).toBe('ok');
  });

  it('rethrows non-timeout errors unchanged', async () => {
    // --- ARRANGE ---
    const err = new Error('boom');
    const handler: CallHandler = { handle: () => throwError(() => err) };

    // --- ACT & ASSERT ---
    await expect(lastValueFrom(interceptor.intercept(ctx, handler))).rejects.toBe(err);
  });

  it('converts rxjs TimeoutError into GEN.REQUEST_TIMEOUT', async () => {
    // --- ARRANGE ---
    jest.useFakeTimers();
    const handler: CallHandler = { handle: () => NEVER };

    try {
      const promise = lastValueFrom(interceptor.intercept(ctx, handler));
      // Advance past the timeout window so the operator fires.
      jest.advanceTimersByTime(DEFAULT_REQUEST_TIMEOUT_MS + 10);

      // --- ACT & ASSERT ---
      await expect(promise).rejects.toBeInstanceOf(ErrorException);
      await expect(promise).rejects.toMatchObject({ code: 'GEN0002' });
    } finally {
      jest.useRealTimers();
    }
  });
});
