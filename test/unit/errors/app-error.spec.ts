import { AppError } from '@errors/types/app-error';
import { ERROR_CODES } from '@common/constants/error-codes';

describe('AppError', () => {
  describe('constructor', () => {
    it('should create with correct properties', () => {
      // --- ARRANGE ---
      const code = 'VAL0001';
      const message = 'Test validation error';
      const statusCode = 400;

      // --- ACT ---
      const error = new AppError(code, message, statusCode);

      // --- ASSERT ---
      expect(error.code).toBe(code);
      expect(error.message).toBe(message);
      expect(error.statusCode).toBe(statusCode);
      expect(error.isOperational).toBe(true);
      expect(error.details).toBeUndefined();
      expect(error.cause).toBeUndefined();
    });

    it('should set isOperational to false when specified', () => {
      // --- ARRANGE & ACT ---
      const error = new AppError('SRV0001', 'Internal error', 500, {
        isOperational: false,
      });

      // --- ASSERT ---
      expect(error.isOperational).toBe(false);
    });

    it('should set details when provided', () => {
      // --- ARRANGE ---
      const details = [{ field: 'email', message: 'Must be valid email' }];

      // --- ACT ---
      const error = new AppError('VAL0001', 'Validation error', 400, { details });

      // --- ASSERT ---
      expect(error.details).toEqual(details);
    });

    it('should set cause when provided', () => {
      // --- ARRANGE ---
      const cause = new Error('original error');

      // --- ACT ---
      const error = new AppError('SRV0001', 'Server error', 500, { cause });

      // --- ASSERT ---
      expect(error.cause).toBe(cause);
    });
  });

  describe('fromCode', () => {
    it('should create from ERROR_CODES using key', () => {
      // --- ARRANGE & ACT ---
      const error = AppError.fromCode('VAL0001');

      // --- ASSERT ---
      expect(error.code).toBe(ERROR_CODES.VAL0001.code);
      expect(error.message).toBe(ERROR_CODES.VAL0001.message);
      expect(error.statusCode).toBe(ERROR_CODES.VAL0001.statusCode);
    });

    it('should allow overriding message', () => {
      // --- ARRANGE ---
      const customMessage = 'Custom error message';

      // --- ACT ---
      const error = AppError.fromCode('VAL0001', { message: customMessage });

      // --- ASSERT ---
      expect(error.message).toBe(customMessage);
      expect(error.code).toBe(ERROR_CODES.VAL0001.code);
    });

    it('should create DAT0001 with correct http status', () => {
      // --- ARRANGE & ACT ---
      const error = AppError.fromCode('DAT0001');

      // --- ASSERT ---
      expect(error.statusCode).toBe(404);
    });

    it('should create SRV0001 with correct http status', () => {
      // --- ARRANGE & ACT ---
      const error = AppError.fromCode('SRV0001');

      // --- ASSERT ---
      expect(error.statusCode).toBe(500);
    });
  });

  describe('wrap', () => {
    it('should return existing AppError as-is', () => {
      // --- ARRANGE ---
      const original = new AppError('VAL0001', 'Validation error', 400);

      // --- ACT ---
      const wrapped = AppError.wrap(original);

      // --- ASSERT ---
      expect(wrapped).toBe(original);
    });

    it('should wrap unknown errors as SRV0001', () => {
      // --- ARRANGE ---
      const unknownError = new Error('Something broke');

      // --- ACT ---
      const wrapped = AppError.wrap(unknownError);

      // --- ASSERT ---
      expect(wrapped).toBeInstanceOf(AppError);
      expect(wrapped.code).toBe('SRV0001');
      expect(wrapped.isOperational).toBe(false);
      expect(wrapped.cause).toBe(unknownError);
    });

    it('should wrap non-Error values as SRV0001', () => {
      // --- ARRANGE ---
      const stringError = 'plain string error';

      // --- ACT ---
      const wrapped = AppError.wrap(stringError);

      // --- ASSERT ---
      expect(wrapped).toBeInstanceOf(AppError);
      expect(wrapped.code).toBe('SRV0001');
      expect(wrapped.isOperational).toBe(false);
    });
  });

  describe('isAppError', () => {
    it('should return true for AppError instances', () => {
      // --- ARRANGE ---
      const error = new AppError('VAL0001', 'Test', 400);

      // --- ACT & ASSERT ---
      expect(AppError.isAppError(error)).toBe(true);
    });

    it('should return false for plain Error instances', () => {
      // --- ARRANGE ---
      const error = new Error('Not an AppError');

      // --- ACT & ASSERT ---
      expect(AppError.isAppError(error)).toBe(false);
    });

    it('should return false for null', () => {
      // --- ACT & ASSERT ---
      expect(AppError.isAppError(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      // --- ACT & ASSERT ---
      expect(AppError.isAppError(undefined)).toBe(false);
    });
  });

  describe('toLog', () => {
    it('should include all basic properties', () => {
      // --- ARRANGE ---
      const error = new AppError('VAL0001', 'Test error', 400);

      // --- ACT ---
      const log = error.toLog();

      // --- ASSERT ---
      expect(log.code).toBe('VAL0001');
      expect(log.message).toBe('Test error');
      expect(log.statusCode).toBe(400);
      expect(log.isOperational).toBe(true);
    });

    it('should include cause details when cause is an Error', () => {
      // --- ARRANGE ---
      const cause = new Error('Root cause');
      const error = new AppError('SRV0001', 'Server error', 500, { cause });

      // --- ACT ---
      const log = error.toLog();

      // --- ASSERT ---
      expect(log.cause).toBeDefined();
      expect((log.cause as Record<string, unknown>).message).toBe('Root cause');
    });

    it('should not include cause when cause is not an Error', () => {
      // --- ARRANGE ---
      const error = new AppError('VAL0001', 'Validation error', 400);

      // --- ACT ---
      const log = error.toLog();

      // --- ASSERT ---
      expect(log.cause).toBeUndefined();
    });
  });

  describe('toResponse', () => {
    it('should include original message for operational errors', () => {
      // --- ARRANGE ---
      const error = new AppError('VAL0001', 'Custom validation message', 400, {
        isOperational: true,
      });

      // --- ACT ---
      const response = error.toResponse();

      // --- ASSERT ---
      expect(response.message).toBe('Custom validation message');
      expect(response.code).toBe('VAL0001');
    });

    it('should mask message for non-operational errors', () => {
      // --- ARRANGE ---
      const error = new AppError('SRV0001', 'Sensitive internal error details', 500, {
        isOperational: false,
      });

      // --- ACT ---
      const response = error.toResponse();

      // --- ASSERT ---
      expect(response.message).toBe(ERROR_CODES.SRV0001.message);
      expect(response.message).not.toBe('Sensitive internal error details');
    });

    it('should include requestId and traceId when provided', () => {
      // --- ARRANGE ---
      const error = new AppError('VAL0001', 'Test', 400);
      const requestId = 'req-123';
      const traceId = 'trace-456';

      // --- ACT ---
      const response = error.toResponse(requestId, traceId);

      // --- ASSERT ---
      expect(response.requestId).toBe(requestId);
      expect(response.traceId).toBe(traceId);
    });
  });
});
