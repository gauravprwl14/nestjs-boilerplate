import { ZodError } from 'zod';
import { z } from 'zod';
import { ErrorFactory } from '@errors/types/error-factory';
import { AppError } from '@errors/types/app-error';

describe('ErrorFactory', () => {
  describe('validation()', () => {
    it('should create a VAL0001 error', () => {
      // --- ARRANGE & ACT ---
      const error = ErrorFactory.validation();

      // --- ASSERT ---
      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe('VAL0001');
      expect(error.statusCode).toBe(400);
    });

    it('should use custom message when provided', () => {
      // --- ARRANGE ---
      const customMessage = 'Custom validation message';

      // --- ACT ---
      const error = ErrorFactory.validation(customMessage);

      // --- ASSERT ---
      expect(error.message).toBe(customMessage);
    });

    it('should include field details when provided', () => {
      // --- ARRANGE ---
      const details = [{ field: 'email', message: 'Must be valid email' }];

      // --- ACT ---
      const error = ErrorFactory.validation('Validation failed', details);

      // --- ASSERT ---
      expect(error.details).toEqual(details);
    });
  });

  describe('notFound()', () => {
    it('should create a DAT0001 error with resource name', () => {
      // --- ARRANGE & ACT ---
      const error = ErrorFactory.notFound('User');

      // --- ASSERT ---
      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe('DAT0001');
      expect(error.statusCode).toBe(404);
      expect(error.message).toContain('User');
    });

    it('should include identifier in message when provided', () => {
      // --- ARRANGE ---
      const identifier = 'user-123';

      // --- ACT ---
      const error = ErrorFactory.notFound('User', identifier);

      // --- ASSERT ---
      expect(error.message).toContain(identifier);
      expect(error.message).toContain('User');
    });

    it('should work without identifier', () => {
      // --- ARRANGE & ACT ---
      const error = ErrorFactory.notFound('TodoList');

      // --- ASSERT ---
      expect(error.message).toBe('TodoList not found');
    });
  });

  describe('uniqueViolation()', () => {
    it('should create a DAT0003 error with field name', () => {
      // --- ARRANGE & ACT ---
      const error = ErrorFactory.uniqueViolation('email');

      // --- ASSERT ---
      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe('DAT0003');
      expect(error.statusCode).toBe(409);
      expect(error.message).toContain('email');
    });

    it('should include field-level details', () => {
      // --- ARRANGE & ACT ---
      const error = ErrorFactory.uniqueViolation('username');

      // --- ASSERT ---
      expect(error.details).toBeDefined();
      expect(error.details).toHaveLength(1);
      expect(error.details![0].field).toBe('username');
    });
  });

  describe('invalidStatusTransition()', () => {
    it('should create a VAL0004 error with from/to in message', () => {
      // --- ARRANGE & ACT ---
      const error = ErrorFactory.invalidStatusTransition('PENDING', 'ARCHIVED');

      // --- ASSERT ---
      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe('VAL0004');
      expect(error.statusCode).toBe(400);
      expect(error.message).toContain('PENDING');
      expect(error.message).toContain('ARCHIVED');
    });
  });

  describe('fromZodErrors()', () => {
    it('should convert Zod errors to AppError with field details', () => {
      // --- ARRANGE ---
      const schema = z.object({
        email: z.string().email(),
        name: z.string().min(1),
      });

      let zodError: ZodError;
      try {
        schema.parse({ email: 'not-an-email', name: '' });
      } catch (e) {
        zodError = e as ZodError;
      }

      // --- ACT ---
      const error = ErrorFactory.fromZodErrors(zodError!);

      // --- ASSERT ---
      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe('VAL0001');
      expect(error.details).toBeDefined();
      expect(error.details!.length).toBeGreaterThan(0);
      expect(error.details!.some((d) => d.field === 'email')).toBe(true);
    });

    it('should use _root field for top-level Zod errors', () => {
      // --- ARRANGE ---
      const schema = z.string().min(5);

      let zodError: ZodError;
      try {
        schema.parse('ab');
      } catch (e) {
        zodError = e as ZodError;
      }

      // --- ACT ---
      const error = ErrorFactory.fromZodErrors(zodError!);

      // --- ASSERT ---
      expect(error.details!.some((d) => d.field === '_root')).toBe(true);
    });
  });

  describe('internal()', () => {
    it('should create a SRV0001 error with isOperational false', () => {
      // --- ARRANGE & ACT ---
      const error = ErrorFactory.internal();

      // --- ASSERT ---
      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe('SRV0001');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(false);
    });

    it('should include cause when provided', () => {
      // --- ARRANGE ---
      const cause = new Error('Original database error');

      // --- ACT ---
      const error = ErrorFactory.internal(cause);

      // --- ASSERT ---
      expect(error.cause).toBe(cause);
    });
  });
});
