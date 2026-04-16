/**
 * @deprecated This file is kept for compatibility. Tests have been migrated to error-exception.spec.ts.
 * All AppError references have been updated to ErrorException.
 */
import { ErrorException } from '@errors/types/error-exception';
import { ERROR_CODES, VAL, DAT, SRV } from '@errors/error-codes';

describe('ErrorException (migrated from AppError)', () => {
  describe('constructor', () => {
    it('should create with correct properties', () => {
      // --- ARRANGE & ACT ---
      const error = new ErrorException(VAL.INVALID_INPUT, {
        message: 'Test validation error',
      });

      // --- ASSERT ---
      expect(error.code).toBe('VAL0001');
      expect(error.message).toBe('Test validation error');
      expect(error.statusCode).toBe(400);
      expect(error.details).toBeUndefined();
      expect(error.cause).toBeUndefined();
    });

    it('should set details when provided', () => {
      // --- ARRANGE ---
      const details = [{ field: 'email', message: 'Must be valid email' }];

      // --- ACT ---
      const error = new ErrorException(VAL.INVALID_INPUT, { details });

      // --- ASSERT ---
      expect(error.details).toEqual(details);
    });

    it('should set cause when provided', () => {
      // --- ARRANGE ---
      const cause = new Error('original error');

      // --- ACT ---
      const error = new ErrorException(SRV.INTERNAL_ERROR, { cause });

      // --- ASSERT ---
      expect(error.cause).toBe(cause);
    });
  });

  describe('definition access', () => {
    it('should create from definition with correct properties', () => {
      // --- ARRANGE & ACT ---
      const error = new ErrorException(VAL.INVALID_INPUT);

      // --- ASSERT ---
      expect(error.code).toBe(ERROR_CODES.VAL.INVALID_INPUT.code);
      expect(error.message).toBe(ERROR_CODES.VAL.INVALID_INPUT.message);
      expect(error.statusCode).toBe(ERROR_CODES.VAL.INVALID_INPUT.httpStatus);
    });

    it('should allow overriding message', () => {
      // --- ARRANGE ---
      const customMessage = 'Custom error message';

      // --- ACT ---
      const error = new ErrorException(VAL.INVALID_INPUT, { message: customMessage });

      // --- ASSERT ---
      expect(error.message).toBe(customMessage);
      expect(error.code).toBe(ERROR_CODES.VAL.INVALID_INPUT.code);
    });

    it('should create DAT.NOT_FOUND with correct http status', () => {
      // --- ARRANGE & ACT ---
      const error = new ErrorException(DAT.NOT_FOUND);

      // --- ASSERT ---
      expect(error.statusCode).toBe(404);
    });

    it('should create SRV.INTERNAL_ERROR with correct http status', () => {
      // --- ARRANGE & ACT ---
      const error = new ErrorException(SRV.INTERNAL_ERROR);

      // --- ASSERT ---
      expect(error.statusCode).toBe(500);
    });
  });

  describe('wrap', () => {
    it('should return existing ErrorException as-is', () => {
      // --- ARRANGE ---
      const original = new ErrorException(VAL.INVALID_INPUT);

      // --- ACT ---
      const wrapped = ErrorException.wrap(original);

      // --- ASSERT ---
      expect(wrapped).toBe(original);
    });

    it('should wrap unknown errors as SRV0001', () => {
      // --- ARRANGE ---
      const unknownError = new Error('Something broke');

      // --- ACT ---
      const wrapped = ErrorException.wrap(unknownError);

      // --- ASSERT ---
      expect(wrapped).toBeInstanceOf(ErrorException);
      expect(wrapped.code).toBe('SRV0001');
      expect(wrapped.cause).toBe(unknownError);
    });

    it('should wrap non-Error values as SRV0001', () => {
      // --- ARRANGE ---
      const stringError = 'plain string error';

      // --- ACT ---
      const wrapped = ErrorException.wrap(stringError);

      // --- ASSERT ---
      expect(wrapped).toBeInstanceOf(ErrorException);
      expect(wrapped.code).toBe('SRV0001');
    });
  });

  describe('isErrorException', () => {
    it('should return true for ErrorException instances', () => {
      const error = new ErrorException(VAL.INVALID_INPUT);
      expect(ErrorException.isErrorException(error)).toBe(true);
    });

    it('should return false for plain Error instances', () => {
      const error = new Error('Not an ErrorException');
      expect(ErrorException.isErrorException(error)).toBe(false);
    });

    it('should return false for null', () => {
      expect(ErrorException.isErrorException(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(ErrorException.isErrorException(undefined)).toBe(false);
    });
  });

  describe('toLog', () => {
    it('should include all basic properties', () => {
      // --- ARRANGE ---
      const error = new ErrorException(VAL.INVALID_INPUT, { message: 'Test error' });

      // --- ACT ---
      const log = error.toLog();

      // --- ASSERT ---
      expect(log.code).toBe('VAL0001');
      expect(log.message).toBe('Test error');
      expect(log.statusCode).toBe(400);
    });

    it('should include cause details when cause is an Error', () => {
      // --- ARRANGE ---
      const cause = new Error('Root cause');
      const error = new ErrorException(SRV.INTERNAL_ERROR, { cause });

      // --- ACT ---
      const log = error.toLog();

      // --- ASSERT ---
      expect(log.cause).toBeDefined();
      expect((log.cause as Array<{ message: string }>)[0].message).toBe('Root cause');
    });

    it('should not include cause when no cause', () => {
      // --- ARRANGE ---
      const error = new ErrorException(VAL.INVALID_INPUT);

      // --- ACT ---
      const log = error.toLog();

      // --- ASSERT ---
      expect(log.cause).toBeUndefined();
    });
  });

  describe('toResponse', () => {
    it('should include original message for userFacing errors', () => {
      // --- ARRANGE ---
      const error = new ErrorException(VAL.INVALID_INPUT, {
        message: 'Custom validation message',
      });

      // --- ACT ---
      const response = error.toResponse();

      // --- ASSERT ---
      expect(response.message).toBe('Custom validation message');
      expect(response.code).toBe('VAL0001');
    });

    it('should mask message for non-userFacing errors', () => {
      // --- ARRANGE ---
      const error = new ErrorException(SRV.INTERNAL_ERROR, {
        message: 'Sensitive internal error details',
      });

      // --- ACT ---
      const response = error.toResponse();

      // --- ASSERT ---
      expect(response.message).toBe(ERROR_CODES.SRV.INTERNAL_ERROR.message);
      expect(response.message).not.toBe('Sensitive internal error details');
    });
  });
});
