import {
  PrismaClientKnownRequestError,
  PrismaClientValidationError,
  PrismaClientInitializationError,
  PrismaClientRustPanicError,
  PrismaClientUnknownRequestError,
} from '@prisma/client/runtime/client';
import { AppError } from '../types/app-error';
import { ErrorCodeKey } from '@common/constants/error-codes';

/**
 * Metadata attached to a Prisma error map entry.
 */
interface PrismaErrorMapEntry {
  /** ERROR_CODES key to use for the AppError */
  key: ErrorCodeKey;
  /** Generate a human-readable message from the Prisma error meta */
  message: (meta?: Record<string, unknown>) => string;
}

/**
 * Mapping from Prisma error codes to AppError factory metadata.
 *
 * Prisma error codes reference:
 * https://www.prisma.io/docs/reference/api-reference/error-reference
 */
export const PRISMA_ERROR_MAP: Record<string, PrismaErrorMapEntry> = {
  /** Unique constraint failed */
  P2002: {
    key: 'DAT0003',
    message: (meta) => {
      const target = Array.isArray(meta?.['target'])
        ? (meta['target'] as string[]).join(', ')
        : (meta?.['target'] as string | undefined) ?? 'unknown field';
      return `Unique constraint violation on: ${target}`;
    },
  },
  /** Foreign key constraint failed */
  P2003: {
    key: 'DAT0004',
    message: (meta) => {
      const field = (meta?.['field_name'] as string | undefined) ?? 'unknown field';
      return `Foreign key constraint violation on: ${field}`;
    },
  },
  /** Record not found */
  P2025: {
    key: 'DAT0001',
    message: (meta) => {
      const cause = (meta?.['cause'] as string | undefined) ?? 'Record not found';
      return cause;
    },
  },
  /** A required value was not provided */
  P2011: {
    key: 'VAL0002',
    message: (meta) => {
      const constraint = (meta?.['constraint'] as string | undefined) ?? 'unknown field';
      return `Null constraint violation on: ${constraint}`;
    },
  },
  /** The provided value for the column is too long */
  P2000: {
    key: 'VAL0003',
    message: (meta) => {
      const column = (meta?.['column_name'] as string | undefined) ?? 'unknown column';
      return `Value too long for column: ${column}`;
    },
  },
};

/**
 * Determine whether an unknown value is a Prisma error.
 *
 * @param error - Value to test
 * @returns True if the value is any of the Prisma error types
 */
export function isPrismaError(error: unknown): boolean {
  return (
    error instanceof PrismaClientKnownRequestError ||
    error instanceof PrismaClientValidationError ||
    error instanceof PrismaClientInitializationError ||
    error instanceof PrismaClientRustPanicError ||
    error instanceof PrismaClientUnknownRequestError
  );
}

/**
 * Convert a Prisma error into an AppError.
 *
 * Returns `undefined` if the supplied value is not a recognised Prisma error,
 * allowing callers to fall through to other error handling logic.
 *
 * @param error - The unknown error to inspect
 * @returns An AppError if the error is a Prisma error, otherwise undefined
 */
export function handlePrismaError(error: unknown): AppError | undefined {
  // PrismaClientKnownRequestError — maps to specific domain errors
  if (error instanceof PrismaClientKnownRequestError) {
    const entry = PRISMA_ERROR_MAP[error.code];
    if (entry) {
      return AppError.fromCode(entry.key, {
        message: entry.message(error.meta),
        cause: error,
      });
    }
    // Unmapped known code — fall back to generic query failure
    return AppError.fromCode('DAT0007', {
      message: `Database error [${error.code}]: ${error.message}`,
      cause: error,
      isOperational: false,
    });
  }

  // PrismaClientValidationError — invalid query shape
  if (error instanceof PrismaClientValidationError) {
    return AppError.fromCode('VAL0001', {
      message: 'Invalid database query',
      cause: error,
    });
  }

  // PrismaClientInitializationError — cannot connect / initialise
  if (error instanceof PrismaClientInitializationError) {
    return AppError.fromCode('DAT0006', {
      message: 'Database initialisation failed',
      cause: error,
      isOperational: false,
    });
  }

  // PrismaClientRustPanicError — unrecoverable engine crash
  if (error instanceof PrismaClientRustPanicError) {
    return AppError.fromCode('SRV0001', {
      message: 'Database engine crash',
      cause: error,
      isOperational: false,
    });
  }

  // PrismaClientUnknownRequestError — unknown engine-level error
  if (error instanceof PrismaClientUnknownRequestError) {
    return AppError.fromCode('DAT0007', {
      message: 'Unknown database error',
      cause: error,
      isOperational: false,
    });
  }

  return undefined;
}

/**
 * Higher-order function that wraps an async operation with Prisma error handling.
 *
 * Any Prisma errors thrown by `fn` are converted to AppErrors before being
 * re-thrown. Non-Prisma errors are re-thrown unchanged.
 *
 * @param fn - Async function to execute
 * @returns The result of `fn`
 * @throws AppError when a Prisma error is encountered
 *
 * @example
 * ```typescript
 * const user = await withPrismaErrorHandling(() =>
 *   this.prisma.user.findUniqueOrThrow({ where: { id } }),
 * );
 * ```
 */
export async function withPrismaErrorHandling<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error: unknown) {
    const appError = handlePrismaError(error);
    if (appError) {
      throw appError;
    }
    throw error;
  }
}
