import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';
import { CatchDbError } from '@database/decorators/catch-db-error.decorator';
import { ErrorException } from '@errors/types/error-exception';

/**
 * Helper to create a PrismaClientKnownRequestError with a specific code.
 */
function makePrismaError(
  code: string,
  meta?: Record<string, unknown>,
): PrismaClientKnownRequestError {
  return new PrismaClientKnownRequestError('Prisma error', {
    code,
    clientVersion: '5.0.0',
    meta,
  });
}

/**
 * Test class to apply the decorator to.
 */
class TestRepository {
  @CatchDbError()
  async throwNothing(): Promise<string> {
    return 'success';
  }

  @CatchDbError()
  async throwUniqueViolation(): Promise<void> {
    throw makePrismaError('P2002', { target: ['email'] });
  }

  @CatchDbError()
  async throwNotFound(): Promise<void> {
    throw makePrismaError('P2025', { cause: 'Record not found' });
  }

  @CatchDbError()
  async throwForeignKey(): Promise<void> {
    throw makePrismaError('P2003', { field_name: 'userId' });
  }

  @CatchDbError()
  async throwNonPrismaError(): Promise<void> {
    throw new Error('Non-Prisma error');
  }

  @CatchDbError()
  async throwPlainString(): Promise<void> {
    throw new TypeError('Type error');
  }
}

describe('CatchDbError decorator', () => {
  let repo: TestRepository;

  beforeEach(() => {
    repo = new TestRepository();
  });

  describe('pass-through for non-errors', () => {
    it('should return the value when no error is thrown', async () => {
      // --- ACT ---
      const result = await repo.throwNothing();

      // --- ASSERT ---
      expect(result).toBe('success');
    });
  });

  describe('Prisma error conversion', () => {
    it('should convert P2002 (unique violation) to ErrorException with DAT0003', async () => {
      // --- ACT & ASSERT ---
      await expect(repo.throwUniqueViolation()).rejects.toBeInstanceOf(ErrorException);
      await expect(repo.throwUniqueViolation()).rejects.toMatchObject({
        code: 'DAT0003',
        statusCode: 409,
      });
    });

    it('should convert P2025 (not found) to ErrorException with DAT0001', async () => {
      // --- ACT & ASSERT ---
      await expect(repo.throwNotFound()).rejects.toBeInstanceOf(ErrorException);
      await expect(repo.throwNotFound()).rejects.toMatchObject({
        code: 'DAT0001',
        statusCode: 404,
      });
    });

    it('should convert P2003 (foreign key violation) to ErrorException with DAT0004', async () => {
      // --- ACT & ASSERT ---
      await expect(repo.throwForeignKey()).rejects.toBeInstanceOf(ErrorException);
      await expect(repo.throwForeignKey()).rejects.toMatchObject({
        code: 'DAT0004',
        statusCode: 400,
      });
    });
  });

  describe('non-Prisma error pass-through', () => {
    it('should re-throw non-Prisma errors unchanged', async () => {
      // --- ACT & ASSERT ---
      await expect(repo.throwNonPrismaError()).rejects.toBeInstanceOf(Error);
      await expect(repo.throwNonPrismaError()).rejects.not.toBeInstanceOf(ErrorException);
    });

    it('should re-throw TypeError unchanged', async () => {
      // --- ACT & ASSERT ---
      await expect(repo.throwPlainString()).rejects.toBeInstanceOf(TypeError);
    });
  });
});
