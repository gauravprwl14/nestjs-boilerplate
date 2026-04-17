import { ArgumentsHost } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';
import { PrismaExceptionFilter } from '@common/filters/prisma-exception.filter';
import { ErrorException } from '@errors/types/error-exception';

/**
 * PrismaExceptionFilter is a normaliser — it rethrows either an
 * ErrorException or the original exception. It does not write a response.
 */
describe('PrismaExceptionFilter', () => {
  const host = {} as ArgumentsHost;
  let filter: PrismaExceptionFilter;

  beforeEach(() => {
    filter = new PrismaExceptionFilter();
  });

  it('rethrows a Prisma P2025 as a DAT.NOT_FOUND ErrorException', () => {
    // --- ARRANGE ---
    const prismaErr = new PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: '7.0.0',
      meta: { cause: 'Record missing' },
    });

    // --- ACT & ASSERT ---
    try {
      filter.catch(prismaErr, host);
      throw new Error('filter should have rethrown');
    } catch (e: unknown) {
      expect(ErrorException.isErrorException(e)).toBe(true);
      const err = e as ErrorException;
      expect(err.code).toBe('DAT0001');
      expect(err.cause).toBe(prismaErr);
    }
  });

  it('rethrows a P2002 unique violation as DAT.UNIQUE_VIOLATION', () => {
    // --- ARRANGE ---
    const prismaErr = new PrismaClientKnownRequestError('Unique violation', {
      code: 'P2002',
      clientVersion: '7.0.0',
      meta: { target: ['email'] },
    });

    // --- ACT & ASSERT ---
    try {
      filter.catch(prismaErr, host);
      throw new Error('should have rethrown');
    } catch (e: unknown) {
      expect(ErrorException.isErrorException(e)).toBe(true);
      expect((e as ErrorException).message).toContain('email');
    }
  });

  it('rethrows an unmapped Prisma known error as DAT.QUERY_FAILED', () => {
    // --- ARRANGE ---
    const prismaErr = new PrismaClientKnownRequestError('Some P9999 error', {
      code: 'P9999',
      clientVersion: '7.0.0',
    });

    // --- ACT & ASSERT ---
    try {
      filter.catch(prismaErr, host);
      throw new Error('should have rethrown');
    } catch (e: unknown) {
      expect(ErrorException.isErrorException(e)).toBe(true);
      expect((e as ErrorException).code).toBe('DAT0007');
    }
  });

  it('passes through non-Prisma exceptions unchanged', () => {
    // --- ARRANGE ---
    const raw = new Error('nothing to do with prisma');

    // --- ACT & ASSERT ---
    expect(() => filter.catch(raw, host)).toThrow(raw);
  });

  it('passes through a thrown string unchanged', () => {
    // --- ACT & ASSERT ---
    expect(() => filter.catch('plain string', host)).toThrow('plain string');
  });
});
