import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { firstValueFrom, lastValueFrom } from 'rxjs';
import { LoggingInterceptor } from '@common/interceptors/logging.interceptor';
import { createMockLogger } from '../../../helpers';

const ctx = (method = 'GET', url = '/api/v1/x', statusCode = 200): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ method, url }),
      getResponse: () => ({ statusCode }),
    }),
  }) as unknown as ExecutionContext;

describe('LoggingInterceptor', () => {
  let logger: ReturnType<typeof createMockLogger>;
  let interceptor: LoggingInterceptor;

  beforeEach(() => {
    logger = createMockLogger();
    interceptor = new LoggingInterceptor(logger as any);
  });

  it('logs http.request.completed on success with method, url, status, duration', async () => {
    // --- ARRANGE ---
    const handler: CallHandler = { handle: () => of({ ok: true }) };

    // --- ACT ---
    await firstValueFrom(interceptor.intercept(ctx('POST', '/api/v1/tweets', 201), handler));

    // --- ASSERT ---
    expect(logger.logEvent).toHaveBeenCalledWith(
      'http.request.completed',
      expect.objectContaining({
        attributes: expect.objectContaining({
          method: 'POST',
          url: '/api/v1/tweets',
          statusCode: 201,
          duration: expect.any(Number),
        }),
      }),
    );
    expect(logger.logError).not.toHaveBeenCalled();
  });

  it('logs http.request.failed with the thrown Error when the handler errors', async () => {
    // --- ARRANGE ---
    const err = new Error('db down');
    const handler: CallHandler = { handle: () => throwError(() => err) };

    // --- ACT & ASSERT ---
    await expect(
      lastValueFrom(interceptor.intercept(ctx('GET', '/api/v1/timeline'), handler)),
    ).rejects.toBe(err);

    expect(logger.logError).toHaveBeenCalledWith(
      'http.request.failed',
      err,
      expect.objectContaining({
        attributes: expect.objectContaining({
          method: 'GET',
          url: '/api/v1/timeline',
          duration: expect.any(Number),
        }),
      }),
    );
    expect(logger.logEvent).not.toHaveBeenCalled();
  });

  it('wraps a non-Error thrown value into an Error for logError', async () => {
    // --- ARRANGE ---
    const handler: CallHandler = { handle: () => throwError(() => 'just a string') };

    // --- ACT ---
    await expect(lastValueFrom(interceptor.intercept(ctx(), handler))).rejects.toBe(
      'just a string',
    );

    // --- ASSERT ---
    expect(logger.logError).toHaveBeenCalledTimes(1);
    const [, errorArg] = logger.logError.mock.calls[0];
    expect(errorArg).toBeInstanceOf(Error);
    expect((errorArg as Error).message).toBe('just a string');
  });
});
