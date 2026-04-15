import { ErrorException } from '@errors/types/error-exception';
import { ERROR_CODES } from '@errors/error-codes';

describe('ErrorException', () => {
  describe('constructor', () => {
    it('should create with correct properties', () => {
      // --- ARRANGE ---
      const code = 'VAL0001';
      const message = 'Test validation error';
      const statusCode = 400;

      // --- ACT ---
      const error = new ErrorException(code, message, statusCode);

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
      const error = new ErrorException('SRV0001', 'Internal error', 500, {
        isOperational: false,
      });

      // --- ASSERT ---
      expect(error.isOperational).toBe(false);
    });

    it('should set details when provided', () => {
      // --- ARRANGE ---
      const details = [{ field: 'email', message: 'Must be valid email' }];

      // --- ACT ---
      const error = new ErrorException('VAL0001', 'Validation error', 400, { details });

      // --- ASSERT ---
      expect(error.details).toEqual(details);
    });

    it('should set cause when provided', () => {
      // --- ARRANGE ---
      const cause = new Error('original error');

      // --- ACT ---
      const error = new ErrorException('SRV0001', 'Server error', 500, { cause });

      // --- ASSERT ---
      expect(error.cause).toBe(cause);
    });
  });

  describe('fromCode', () => {
    it('should create from ERROR_CODES using dot-notation key', () => {
      // --- ARRANGE & ACT ---
      const error = ErrorException.fromCode('VAL.INVALID_INPUT');

      // --- ASSERT ---
      expect(error.code).toBe(ERROR_CODES.VAL.INVALID_INPUT.code);
      expect(error.message).toBe(ERROR_CODES.VAL.INVALID_INPUT.message);
      expect(error.statusCode).toBe(ERROR_CODES.VAL.INVALID_INPUT.httpStatus);
    });

    it('should allow overriding message', () => {
      // --- ARRANGE ---
      const customMessage = 'Custom error message';

      // --- ACT ---
      const error = ErrorException.fromCode('VAL.INVALID_INPUT', { message: customMessage });

      // --- ASSERT ---
      expect(error.message).toBe(customMessage);
      expect(error.code).toBe(ERROR_CODES.VAL.INVALID_INPUT.code);
    });

    it('should create DAT.NOT_FOUND with correct http status 404', () => {
      // --- ARRANGE & ACT ---
      const error = ErrorException.fromCode('DAT.NOT_FOUND');

      // --- ASSERT ---
      expect(error.statusCode).toBe(404);
    });

    it('should create SRV.INTERNAL_ERROR with correct http status 500', () => {
      // --- ARRANGE & ACT ---
      const error = ErrorException.fromCode('SRV.INTERNAL_ERROR');

      // --- ASSERT ---
      expect(error.statusCode).toBe(500);
    });

    it('should populate errorDefinition with errorType and errorCategory', () => {
      // --- ARRANGE & ACT ---
      const error = ErrorException.fromCode('VAL.INVALID_INPUT');

      // --- ASSERT ---
      expect(error.errorDefinition).toBeDefined();
      expect(error.errorDefinition!.errorType).toBeDefined();
      expect(error.errorDefinition!.errorCategory).toBeDefined();
      expect(error.errorDefinition!.messageKey).toBeDefined();
    });

    it('should create DAT.CONFLICT with httpStatus 409', () => {
      // --- ARRANGE & ACT ---
      const error = ErrorException.fromCode('DAT.CONFLICT');

      // --- ASSERT ---
      expect(error.statusCode).toBe(409);
    });
  });

  describe('wrap', () => {
    it('should return existing ErrorException as-is', () => {
      // --- ARRANGE ---
      const original = new ErrorException('VAL0001', 'Validation error', 400);

      // --- ACT ---
      const wrapped = ErrorException.wrap(original);

      // --- ASSERT ---
      expect(wrapped).toBe(original);
    });

    it('should wrap unknown errors as SRV.INTERNAL_ERROR', () => {
      // --- ARRANGE ---
      const unknownError = new Error('Something broke');

      // --- ACT ---
      const wrapped = ErrorException.wrap(unknownError);

      // --- ASSERT ---
      expect(wrapped).toBeInstanceOf(ErrorException);
      expect(wrapped.code).toBe('SRV0001');
      expect(wrapped.isOperational).toBe(false);
      expect(wrapped.cause).toBe(unknownError);
    });

    it('should wrap non-Error values as SRV.INTERNAL_ERROR', () => {
      // --- ARRANGE ---
      const stringError = 'plain string error';

      // --- ACT ---
      const wrapped = ErrorException.wrap(stringError);

      // --- ASSERT ---
      expect(wrapped).toBeInstanceOf(ErrorException);
      expect(wrapped.code).toBe('SRV0001');
      expect(wrapped.isOperational).toBe(false);
    });
  });

  describe('isErrorException', () => {
    it('should return true for ErrorException instances', () => {
      // --- ARRANGE ---
      const error = new ErrorException('VAL0001', 'Test', 400);

      // --- ACT & ASSERT ---
      expect(ErrorException.isErrorException(error)).toBe(true);
    });

    it('should return false for plain Error instances', () => {
      // --- ARRANGE ---
      const error = new Error('Not an ErrorException');

      // --- ACT & ASSERT ---
      expect(ErrorException.isErrorException(error)).toBe(false);
    });

    it('should return false for null', () => {
      // --- ACT & ASSERT ---
      expect(ErrorException.isErrorException(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      // --- ACT & ASSERT ---
      expect(ErrorException.isErrorException(undefined)).toBe(false);
    });
  });

  describe('toLog', () => {
    it('should include all basic properties', () => {
      // --- ARRANGE ---
      const error = new ErrorException('VAL0001', 'Test error', 400);

      // --- ACT ---
      const log = error.toLog();

      // --- ASSERT ---
      expect(log.code).toBe('VAL0001');
      expect(log.message).toBe('Test error');
      expect(log.statusCode).toBe(400);
      expect(log.isOperational).toBe(true);
    });

    it('should include errorType and errorCategory when errorDefinition is set', () => {
      // --- ARRANGE ---
      const error = ErrorException.fromCode('VAL.INVALID_INPUT');

      // --- ACT ---
      const log = error.toLog();

      // --- ASSERT ---
      expect(log.errorType).toBeDefined();
      expect(log.errorCategory).toBeDefined();
    });

    it('should include cause details when cause is an Error', () => {
      // --- ARRANGE ---
      const cause = new Error('Root cause');
      const error = new ErrorException('SRV0001', 'Server error', 500, { cause });

      // --- ACT ---
      const log = error.toLog();

      // --- ASSERT ---
      expect(log.cause).toBeDefined();
      expect((log.cause as Record<string, unknown>).message).toBe('Root cause');
    });

    it('should not include cause when cause is not an Error', () => {
      // --- ARRANGE ---
      const error = new ErrorException('VAL0001', 'Validation error', 400);

      // --- ACT ---
      const log = error.toLog();

      // --- ASSERT ---
      expect(log.cause).toBeUndefined();
    });
  });

  describe('toResponse', () => {
    it('should include original message for operational errors', () => {
      // --- ARRANGE ---
      const error = new ErrorException('VAL0001', 'Custom validation message', 400, {
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
      const error = new ErrorException('SRV0001', 'Sensitive internal error details', 500, {
        isOperational: false,
      });

      // --- ACT ---
      const response = error.toResponse();

      // --- ASSERT ---
      expect(response.message).toBe(ERROR_CODES.SRV.INTERNAL_ERROR.message);
      expect(response.message).not.toBe('Sensitive internal error details');
    });

    it('should include errorType and errorCategory when errorDefinition is set', () => {
      // --- ARRANGE ---
      const error = ErrorException.fromCode('VAL.INVALID_INPUT');

      // --- ACT ---
      const response = error.toResponse();

      // --- ASSERT ---
      expect(response.errorType).toBeDefined();
      expect(response.errorCategory).toBeDefined();
    });

    it('should include details when provided', () => {
      // --- ARRANGE ---
      const details = [{ field: 'email', message: 'Must be valid email' }];
      const error = ErrorException.fromCode('VAL.INVALID_INPUT', { details });

      // --- ACT ---
      const response = error.toResponse();

      // --- ASSERT ---
      expect(response.details).toEqual(details);
    });
  });
});
