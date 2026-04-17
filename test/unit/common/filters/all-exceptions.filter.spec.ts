import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from '@common/filters/all-exceptions.filter';
import { ErrorException } from '@errors/types/error-exception';
import { AUT, DAT, SRV, VAL } from '@errors/error-codes';
import { LogLevel } from '@logger/logger.interfaces';
import { createMockLogger, createMockConfig } from '../../../helpers';

type MockResponse = {
  status: jest.Mock;
  json: jest.Mock;
  statusCode?: number;
};

const buildHost = (
  request: Record<string, unknown> = {},
  response: Partial<MockResponse> = {},
): { host: ArgumentsHost; response: MockResponse } => {
  const res: MockResponse = {
    status: jest.fn().mockImplementation(function (this: MockResponse, code: number) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn().mockReturnThis(),
    ...response,
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'GET', url: '/api/v1/x', id: 'req-123', ...request }),
      getResponse: () => res,
    }),
  } as unknown as ArgumentsHost;
  return { host, response: res };
};

describe('AllExceptionsFilter', () => {
  let logger: ReturnType<typeof createMockLogger>;
  let config: ReturnType<typeof createMockConfig>;
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    logger = createMockLogger();
    config = createMockConfig();
    filter = new AllExceptionsFilter(logger as any, config as any);
  });

  describe('ErrorException pass-through', () => {
    it('sends the toResponse body with the statusCode and logs a 4xx as WARN', () => {
      // --- ARRANGE ---
      const err = new ErrorException(VAL.INVALID_INPUT, { message: 'bad email' });
      const { host, response } = buildHost();

      // --- ACT ---
      filter.catch(err, host);

      // --- ASSERT ---
      expect(response.status).toHaveBeenCalledWith(400);
      expect(response.json).toHaveBeenCalledTimes(1);
      const body = response.json.mock.calls[0][0];
      expect(body.success).toBe(false);
      expect(body.errors[0].code).toBe('VAL0001');
      expect(body.errors[0].message).toBe('bad email');
      expect(body.requestId).toBe('req-123');

      expect(logger.log).toHaveBeenCalledWith(
        'http.error',
        expect.objectContaining({ level: LogLevel.WARN }),
      );
      expect(logger.logError).not.toHaveBeenCalled();
    });

    it('logs 5xx errors via logError at ERROR severity', () => {
      // --- ARRANGE ---
      const err = new ErrorException(SRV.INTERNAL_ERROR);
      const { host, response } = buildHost();

      // --- ACT ---
      filter.catch(err, host);

      // --- ASSERT ---
      expect(response.status).toHaveBeenCalledWith(500);
      expect(logger.logError).toHaveBeenCalledWith(
        'http.error',
        err,
        expect.objectContaining({
          attributes: expect.objectContaining({ 'http.status': 500 }),
        }),
      );
      expect(logger.log).not.toHaveBeenCalled();
    });

    it('includes the cause chain only when not in production', () => {
      // --- ARRANGE ---
      const cause = new Error('driver failed');
      const err = new ErrorException(SRV.INTERNAL_ERROR, { cause });
      const { host, response } = buildHost();

      // --- ACT ---
      filter.catch(err, host);

      // --- ASSERT ---
      const body = response.json.mock.calls[0][0];
      expect(body.errors[0].cause).toBeDefined();
      expect(body.errors[0].cause[0].message).toBe('driver failed');
    });

    it('omits the cause chain in production', () => {
      // --- ARRANGE ---
      config.isProduction = true;
      const cause = new Error('driver failed');
      const err = new ErrorException(SRV.INTERNAL_ERROR, { cause });
      const { host, response } = buildHost();

      // --- ACT ---
      filter.catch(err, host);

      // --- ASSERT ---
      const body = response.json.mock.calls[0][0];
      expect(body.errors[0].cause).toBeUndefined();
    });
  });

  describe('HttpException fallback', () => {
    it('maps 404 HttpException to DAT.NOT_FOUND', () => {
      // --- ARRANGE ---
      const err = new HttpException('missing', HttpStatus.NOT_FOUND);
      const { host, response } = buildHost();

      // --- ACT ---
      filter.catch(err, host);

      // --- ASSERT ---
      expect(response.status).toHaveBeenCalledWith(404);
      const body = response.json.mock.calls[0][0];
      expect(body.errors[0].code).toBe(DAT.NOT_FOUND.code);
      expect(body.errors[0].message).toBe('missing');
    });

    it('flattens array messages from class-validator style responses', () => {
      // --- ARRANGE ---
      const err = new HttpException(
        { message: ['field a required', 'field b invalid'] },
        HttpStatus.BAD_REQUEST,
      );
      const { host, response } = buildHost();

      // --- ACT ---
      filter.catch(err, host);

      // --- ASSERT ---
      const body = response.json.mock.calls[0][0];
      expect(body.errors[0].message).toBe('field a required, field b invalid');
    });

    it('falls back to SRV.INTERNAL_ERROR for unmapped HTTP statuses', () => {
      // --- ARRANGE ---
      const err = new HttpException('teapot', 418);
      const { host, response } = buildHost();

      // --- ACT ---
      filter.catch(err, host);

      // --- ASSERT ---
      const body = response.json.mock.calls[0][0];
      expect(body.errors[0].code).toBe(SRV.INTERNAL_ERROR.code);
    });

    it('maps 401 HttpException to AUT.UNAUTHENTICATED', () => {
      // --- ARRANGE ---
      const err = new HttpException('no token', HttpStatus.UNAUTHORIZED);
      const { host, response } = buildHost();

      // --- ACT ---
      filter.catch(err, host);

      // --- ASSERT ---
      const body = response.json.mock.calls[0][0];
      expect(body.errors[0].code).toBe(AUT.UNAUTHENTICATED.code);
    });
  });

  describe('unknown exceptions', () => {
    it('wraps a plain Error into SRV.INTERNAL_ERROR', () => {
      // --- ARRANGE ---
      const err = new Error('kaboom');
      const { host, response } = buildHost();

      // --- ACT ---
      filter.catch(err, host);

      // --- ASSERT ---
      expect(response.status).toHaveBeenCalledWith(500);
      const body = response.json.mock.calls[0][0];
      expect(body.errors[0].code).toBe(SRV.INTERNAL_ERROR.code);
    });

    it('wraps a thrown non-Error value without crashing', () => {
      // --- ARRANGE ---
      const { host, response } = buildHost();

      // --- ACT ---
      filter.catch('weird', host);

      // --- ASSERT ---
      expect(response.status).toHaveBeenCalledWith(500);
      expect(response.json).toHaveBeenCalled();
    });
  });

  describe('response envelope', () => {
    it('includes timestamp and leaves requestId undefined when none is present', () => {
      // --- ARRANGE ---
      const err = new ErrorException(VAL.INVALID_INPUT);
      const { host, response } = buildHost({ id: undefined });

      // --- ACT ---
      filter.catch(err, host);

      // --- ASSERT ---
      const body = response.json.mock.calls[0][0];
      expect(typeof body.timestamp).toBe('string');
      expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
      expect(body.requestId).toBeUndefined();
    });
  });
});
