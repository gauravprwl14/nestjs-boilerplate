import { z } from 'zod';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';
import { ErrorException } from '@errors/types/error-exception';

describe('ZodValidationPipe', () => {
  const meta = { type: 'body' as const, metatype: undefined, data: undefined };

  it('returns the parsed value when the schema matches', () => {
    // --- ARRANGE ---
    const schema = z.object({ name: z.string(), age: z.number().int() });
    const pipe = new ZodValidationPipe(schema);
    const input = { name: 'Ada', age: 30 };

    // --- ACT ---
    const result = pipe.transform(input, meta);

    // --- ASSERT ---
    expect(result).toEqual(input);
  });

  it('coerces values according to the schema (proves parsed output is returned)', () => {
    // --- ARRANGE ---
    const schema = z.object({ count: z.coerce.number() });
    const pipe = new ZodValidationPipe(schema);

    // --- ACT ---
    const result = pipe.transform({ count: '42' }, meta) as { count: number };

    // --- ASSERT ---
    expect(result.count).toBe(42);
  });

  it('throws a VAL0001 ErrorException with per-field details when validation fails', () => {
    // --- ARRANGE ---
    const schema = z.object({ email: z.email(), age: z.number().int() });
    const pipe = new ZodValidationPipe(schema);

    // --- ACT & ASSERT ---
    try {
      pipe.transform({ email: 'not-an-email', age: 'nope' }, meta);
      throw new Error('pipe should have thrown');
    } catch (e: unknown) {
      expect(ErrorException.isErrorException(e)).toBe(true);
      const err = e as ErrorException;
      expect(err.code).toBe('VAL0001');
      expect(err.details).toBeDefined();
      const fields = err.details!.map(d => d.field);
      expect(fields).toContain('email');
      expect(fields).toContain('age');
    }
  });

  it('ignores the ArgumentMetadata argument (schema is the only source of truth)', () => {
    // --- ARRANGE ---
    const schema = z.string();
    const pipe = new ZodValidationPipe(schema);

    // --- ACT ---
    const result = pipe.transform('hello', { type: 'query', metatype: undefined, data: 'q' });

    // --- ASSERT ---
    expect(result).toBe('hello');
  });
});
