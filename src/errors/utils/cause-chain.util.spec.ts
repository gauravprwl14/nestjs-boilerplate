import { DAT } from '@errors/error-codes/database.errors';
import { ErrorException } from '@errors/types/error-exception';

import { serialiseErrorChain } from './cause-chain.util';

describe('serialiseErrorChain', () => {
  describe('single-level errors', () => {
    it('returns a single frame for an error with no cause', () => {
      // Arrange
      const err = new Error('boom');

      // Act
      const frames = serialiseErrorChain(err);

      // Assert
      expect(frames).toHaveLength(1);
      expect(frames[0].name).toBe('Error');
      expect(frames[0].message).toBe('boom');
      expect(frames[0].stack).toBeDefined();
    });
  });

  describe('cause-chain walking', () => {
    it('walks Error.cause to the leaf and preserves ErrorException code and statusCode', () => {
      // Arrange — leaf wrapped by ErrorException via ES2022 cause
      const leaf = new Error('db exploded');
      const wrapped = new ErrorException(DAT.QUERY_FAILED, { cause: leaf });

      // Act
      const frames = serialiseErrorChain(wrapped);

      // Assert
      expect(frames).toHaveLength(2);
      expect(frames[0].code).toBe(DAT.QUERY_FAILED.code);
      expect(frames[0].statusCode).toBe(DAT.QUERY_FAILED.httpStatus);
      expect(frames[1].name).toBe('Error');
      expect(frames[1].message).toBe('db exploded');
    });

    it('preserves Prisma-like duck-typed code and meta', () => {
      // Arrange — mimic PrismaClientKnownRequestError shape
      const prismaErr = Object.assign(new Error('Unique'), {
        code: 'P2002',
        meta: { target: ['email'] },
      });

      // Act
      const frames = serialiseErrorChain(prismaErr);

      // Assert
      expect(frames).toHaveLength(1);
      expect(frames[0].code).toBe('P2002');
      expect(frames[0].meta).toEqual({ target: ['email'] });
    });

    it('stops at non-error causes', () => {
      // Arrange — ES2022 allows any cause type, including strings
      const err = new Error('outer');
      (err as Error & { cause?: unknown }).cause = 'string-cause';

      // Act
      const frames = serialiseErrorChain(err);

      // Assert
      expect(frames).toHaveLength(2);
      expect(frames[1]).toEqual({
        name: 'NonErrorCause',
        message: 'string-cause',
      });
    });
  });

  describe('defensive guards', () => {
    it('does not loop on cyclic causes', () => {
      // Arrange — a -> b -> a
      const a = new Error('a');
      const b = new Error('b');
      (a as Error & { cause?: unknown }).cause = b;
      (b as Error & { cause?: unknown }).cause = a;

      // Act
      const frames = serialiseErrorChain(a);

      // Assert
      expect(frames).toHaveLength(2);
      expect(frames[0].message).toBe('a');
      expect(frames[1].message).toBe('b');
    });

    it('respects maxDepth', () => {
      // Arrange — 20 wraps, each cause pointing at the next
      let current: Error = new Error('leaf');
      for (let i = 0; i < 19; i++) {
        const outer = new Error(`level-${i}`);
        (outer as Error & { cause?: unknown }).cause = current;
        current = outer;
      }

      // Act
      const frames = serialiseErrorChain(current, 5);

      // Assert
      expect(frames).toHaveLength(5);
    });

    it('handles null/undefined input gracefully', () => {
      // Act + Assert
      expect(serialiseErrorChain(null)).toEqual([]);
      expect(serialiseErrorChain(undefined)).toEqual([]);
    });
  });
});
