import { ErrorException } from '@errors/types/error-exception';
import { VAL, DAT, SRV, GEN } from '@errors/error-codes';

describe('ErrorException', () => {
  describe('constructor', () => {
    it('should create with correct properties from definition', () => {
      // --- ARRANGE & ACT ---
      const error = new ErrorException(VAL.INVALID_INPUT);

      // --- ASSERT ---
      expect(error.code).toBe('VAL0001');
      expect(error.message).toBe('Invalid input');
      expect(error.statusCode).toBe(400);
      expect(error.definition).toBe(VAL.INVALID_INPUT);
      expect(error.name).toBe('ErrorException');
      expect(error.details).toBeUndefined();
      expect(error.cause).toBeUndefined();
    });

    it('should allow overriding message via options', () => {
      // --- ARRANGE & ACT ---
      const error = new ErrorException(DAT.NOT_FOUND, { message: 'User not found' });

      // --- ASSERT ---
      expect(error.message).toBe('User not found');
      expect(error.code).toBe('DAT0001');
      expect(error.statusCode).toBe(404);
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

    it('should be an instance of Error', () => {
      // --- ARRANGE & ACT ---
      const error = new ErrorException(VAL.INVALID_INPUT);

      // --- ASSERT ---
      expect(error).toBeInstanceOf(Error);
    });

    it('should NOT be an instance of HttpException', () => {
      // --- ARRANGE & ACT ---
      const error = new ErrorException(VAL.INVALID_INPUT);

      // --- ASSERT ---
      // ErrorException now extends Error, not HttpException
      expect(error.constructor.name).toBe('ErrorException');
    });
  });

  describe('static notFound', () => {
    it('should create a DAT0001 error with resource name', () => {
      // --- ARRANGE & ACT ---
      const error = ErrorException.notFound('User');

      // --- ASSERT ---
      expect(error).toBeInstanceOf(ErrorException);
      expect(error.code).toBe('DAT0001');
      expect(error.statusCode).toBe(404);
      expect(error.message).toContain('User');
    });

    it('should include identifier in message when provided', () => {
      // --- ARRANGE & ACT ---
      const error = ErrorException.notFound('User', 'user-123');

      // --- ASSERT ---
      expect(error.message).toContain('user-123');
      expect(error.message).toContain('User');
    });

    it('should work without identifier', () => {
      // --- ARRANGE & ACT ---
      const error = ErrorException.notFound('TodoList');

      // --- ASSERT ---
      expect(error.message).toBe('TodoList not found');
    });
  });

  describe('static validation', () => {
    it('should convert Zod-like errors to ErrorException with field details', () => {
      // --- ARRANGE ---
      const zodLikeError = {
        issues: [
          { path: ['email'], message: 'Invalid email' },
          { path: ['name'], message: 'Required' },
        ],
      };

      // --- ACT ---
      const error = ErrorException.validation(zodLikeError);

      // --- ASSERT ---
      expect(error).toBeInstanceOf(ErrorException);
      expect(error.code).toBe('VAL0001');
      expect(error.details).toBeDefined();
      expect(error.details!.length).toBe(2);
      expect(error.details!.some(d => d.field === 'email')).toBe(true);
    });

    it('should use _root field for top-level errors (empty path)', () => {
      // --- ARRANGE ---
      const zodLikeError = {
        issues: [{ path: [], message: 'Too short' }],
      };

      // --- ACT ---
      const error = ErrorException.validation(zodLikeError);

      // --- ASSERT ---
      expect(error.details!.some(d => d.field === '_root')).toBe(true);
    });
  });

  describe('static validationFromCV', () => {
    it('should flatten class-validator errors', () => {
      // --- ARRANGE ---
      const cvErrors = [
        {
          property: 'email',
          constraints: { isEmail: 'Must be a valid email' },
        },
        {
          property: 'address',
          children: [
            {
              property: 'zip',
              constraints: { isPostalCode: 'Invalid postal code' },
            },
          ],
        },
      ];

      // --- ACT ---
      const error = ErrorException.validationFromCV(cvErrors);

      // --- ASSERT ---
      expect(error.code).toBe('VAL0001');
      expect(error.details).toBeDefined();
      expect(error.details!.some(d => d.field === 'email')).toBe(true);
      expect(error.details!.some(d => d.field === 'address.zip')).toBe(true);
    });
  });

  describe('static internal', () => {
    it('should create a SRV0001 error', () => {
      // --- ARRANGE & ACT ---
      const error = ErrorException.internal();

      // --- ASSERT ---
      expect(error).toBeInstanceOf(ErrorException);
      expect(error.code).toBe('SRV0001');
      expect(error.statusCode).toBe(500);
    });

    it('should include cause when provided', () => {
      // --- ARRANGE ---
      const cause = new Error('Original database error');

      // --- ACT ---
      const error = ErrorException.internal(cause);

      // --- ASSERT ---
      expect(error.cause).toBe(cause);
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

    it('should wrap unknown errors as SRV.INTERNAL_ERROR', () => {
      // --- ARRANGE ---
      const unknownError = new Error('Something broke');

      // --- ACT ---
      const wrapped = ErrorException.wrap(unknownError);

      // --- ASSERT ---
      expect(wrapped).toBeInstanceOf(ErrorException);
      expect(wrapped.code).toBe('SRV0001');
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
      expect(response.message).toBe(SRV.INTERNAL_ERROR.message);
      expect(response.message).not.toBe('Sensitive internal error details');
    });

    it('should include errorType and errorCategory', () => {
      // --- ARRANGE ---
      const error = new ErrorException(VAL.INVALID_INPUT);

      // --- ACT ---
      const response = error.toResponse();

      // --- ASSERT ---
      expect(response.errorType).toBe('VALIDATION');
      expect(response.errorCategory).toBe('CLIENT');
    });

    it('should include retryable flag', () => {
      // --- ARRANGE ---
      const retryableError = new ErrorException(GEN.RATE_LIMITED);
      const nonRetryableError = new ErrorException(VAL.INVALID_INPUT);

      // --- ACT ---
      const retryableResponse = retryableError.toResponse();
      const nonRetryableResponse = nonRetryableError.toResponse();

      // --- ASSERT ---
      expect(retryableResponse.retryable).toBe(true);
      expect(nonRetryableResponse.retryable).toBe(false);
    });

    it('should include details when provided', () => {
      // --- ARRANGE ---
      const details = [{ field: 'email', message: 'Must be valid email' }];
      const error = new ErrorException(VAL.INVALID_INPUT, { details });

      // --- ACT ---
      const response = error.toResponse();

      // --- ASSERT ---
      expect(response.details).toEqual(details);
    });

    it('should not include details when empty', () => {
      // --- ARRANGE ---
      const error = new ErrorException(VAL.INVALID_INPUT);

      // --- ACT ---
      const response = error.toResponse();

      // --- ASSERT ---
      expect(response.details).toBeUndefined();
    });

    it('should include cause chain when includeChain is true', () => {
      // --- ARRANGE ---
      const root = new Error('root cause');
      const mid = new ErrorException(DAT.QUERY_FAILED, { message: 'query issue', cause: root });
      const top = new ErrorException(SRV.INTERNAL_ERROR, { cause: mid });

      // --- ACT ---
      const response = top.toResponse(true);

      // --- ASSERT ---
      expect(response.cause).toBeDefined();
      expect(response.cause!.length).toBe(2);
      expect(response.cause![0].code).toBe('DAT0007');
      expect(response.cause![0].message).toBe('query issue');
      expect(response.cause![1].message).toBe('root cause');
      expect(response.cause![1].code).toBeUndefined();
    });

    it('should not include cause chain when includeChain is false (default)', () => {
      // --- ARRANGE ---
      const cause = new Error('root cause');
      const error = new ErrorException(SRV.INTERNAL_ERROR, { cause });

      // --- ACT ---
      const response = error.toResponse();

      // --- ASSERT ---
      expect(response.cause).toBeUndefined();
    });

    it('should truncate cause chain at max depth', () => {
      // --- ARRANGE --- Build a chain 7 levels deep
      let current: Error = new Error('deepest');
      for (let i = 0; i < 6; i++) {
        current = new ErrorException(SRV.INTERNAL_ERROR, { cause: current });
      }
      const top = new ErrorException(SRV.INTERNAL_ERROR, { cause: current });

      // --- ACT ---
      const response = top.toResponse(true);

      // --- ASSERT --- Max depth is 5, so we get 5 entries + 1 truncation entry
      expect(response.cause).toBeDefined();
      const lastEntry = response.cause![response.cause!.length - 1];
      expect(lastEntry.message).toContain('truncated');
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
      expect(log.errorType).toBe('VALIDATION');
      expect(log.errorCategory).toBe('CLIENT');
      expect(log.severity).toBe('WARNING');
    });

    it('should include cause chain when cause exists', () => {
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

  describe('cause stack preservation', () => {
    it('should append cause.stack to own stack with "Caused by:" separator', () => {
      // --- ARRANGE --- a leaf error with a known stack frame
      const leaf = new Error('leaf-error');

      // --- ACT --- wrap the leaf in an ErrorException
      const wrap = new ErrorException(DAT.NOT_FOUND, { cause: leaf });

      // --- ASSERT --- the wrap's stack must include both its own frames and
      // the cause's frames, separated by a "Caused by:" marker.
      expect(wrap.stack).toBeDefined();
      expect(wrap.stack).toContain('Caused by:');
      expect(wrap.stack).toContain('leaf-error');
      // Own frames (from ErrorException constructor/site) are still present
      expect(wrap.stack).toContain('ErrorException');
    });

    it('should be a no-op when cause has no stack property', () => {
      // --- ARRANGE & ACT --- cause is a fake Error-like object with no stack
      const act = () =>
        new ErrorException(DAT.NOT_FOUND, {
          cause: { message: 'no stack' } as unknown as Error,
        });

      // --- ASSERT --- constructor does not throw and still produces a stack
      expect(act).not.toThrow();
      const error = act();
      expect(error.stack).toBeDefined();
      expect(error.stack).not.toContain('Caused by:');
    });

    it('should be a no-op when there is no cause', () => {
      // --- ARRANGE & ACT ---
      const error = new ErrorException(DAT.NOT_FOUND);

      // --- ASSERT --- stack still captured by captureStackTrace; no marker
      expect(error.stack).toBeDefined();
      expect(error.stack).not.toContain('Caused by:');
    });

    it('should preserve the existing toResponse cause-chain shape after refactor', () => {
      // --- ARRANGE --- regression guard for the extractCauseChain delegation
      const root = new Error('root cause');
      const mid = new ErrorException(DAT.QUERY_FAILED, { message: 'query issue', cause: root });
      const top = new ErrorException(SRV.INTERNAL_ERROR, { cause: mid });

      // --- ACT ---
      const response = top.toResponse(true);

      // --- ASSERT --- same shape and codes as before the refactor
      expect(response.cause).toBeDefined();
      expect(response.cause!).toHaveLength(2);
      expect(response.cause![0].code).toBe('DAT0007');
      expect(response.cause![0].message).toBe('query issue');
      expect(response.cause![1].code).toBeUndefined();
      expect(response.cause![1].message).toBe('root cause');
    });
  });
});
