import {
  PrismaClientKnownRequestError,
  PrismaClientValidationError,
  PrismaClientInitializationError,
  PrismaClientRustPanicError,
  PrismaClientUnknownRequestError,
} from '@prisma/client/runtime/client';
import { ErrorException } from '../types/error-exception';
import { ErrorCodeDefinition } from '../interfaces/error.interfaces';
import { DAT } from '../error-codes/database.errors';
import { VAL } from '../error-codes/validation.errors';
import { SRV } from '../error-codes/server.errors';

/**
 * Metadata attached to a Prisma error map entry.
 */
interface PrismaErrorMapEntry {
  /** ErrorCodeDefinition to use for the ErrorException */
  definition: ErrorCodeDefinition;
  /** Generate a human-readable message from the Prisma error meta */
  message: (meta?: Record<string, unknown>) => string;
}

/**
 * Mapping from Prisma error codes to ErrorException factory metadata.
 *
 * Prisma error codes reference:
 * https://www.prisma.io/docs/reference/api-reference/error-reference
 */
export const PRISMA_ERROR_MAP: Record<string, PrismaErrorMapEntry> = {
  /** Unique constraint failed */
  P2002: {
    definition: DAT.UNIQUE_VIOLATION,
    message: meta => {
      const target = Array.isArray(meta?.['target'])
        ? (meta['target'] as string[]).join(', ')
        : ((meta?.['target'] as string | undefined) ?? 'unknown field');
      return `Unique constraint violation on: ${target}`;
    },
  },
  /** Foreign key constraint failed */
  P2003: {
    definition: DAT.FOREIGN_KEY_VIOLATION,
    message: meta => {
      const field = (meta?.['field_name'] as string | undefined) ?? 'unknown field';
      return `Foreign key constraint violation on: ${field}`;
    },
  },
  /** Record not found */
  P2025: {
    definition: DAT.NOT_FOUND,
    message: meta => {
      const cause = (meta?.['cause'] as string | undefined) ?? 'Record not found';
      return cause;
    },
  },
  /** A required value was not provided */
  P2011: {
    definition: VAL.REQUIRED_FIELD,
    message: meta => {
      const constraint = (meta?.['constraint'] as string | undefined) ?? 'unknown field';
      return `Null constraint violation on: ${constraint}`;
    },
  },
  /** The provided value for the column is too long */
  P2000: {
    definition: VAL.FIELD_TOO_LONG,
    message: meta => {
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
 * Convert a Prisma error into an ErrorException.
 *
 * Returns `undefined` if the supplied value is not a recognised Prisma error,
 * allowing callers to fall through to other error handling logic.
 *
 * Always preserves the original Prisma error as `cause` in the chain.
 *
 * @param error - The unknown error to inspect
 * @returns An ErrorException if the error is a Prisma error, otherwise undefined
 */
export function handlePrismaError(error: unknown): ErrorException | undefined {
  // PrismaClientKnownRequestError — maps to specific domain errors
  if (error instanceof PrismaClientKnownRequestError) {
    const entry = PRISMA_ERROR_MAP[error.code];
    if (entry) {
      return new ErrorException(entry.definition, {
        message: entry.message(error.meta),
        cause: error,
      });
    }
    // Unmapped known code — fall back to generic query failure
    return new ErrorException(DAT.QUERY_FAILED, {
      message: `Database error [${error.code}]: ${error.message}`,
      cause: error,
    });
  }

  // PrismaClientValidationError — invalid query shape
  if (error instanceof PrismaClientValidationError) {
    return new ErrorException(VAL.INVALID_INPUT, {
      message: 'Invalid database query',
      cause: error,
    });
  }

  // PrismaClientInitializationError — cannot connect / initialise
  if (error instanceof PrismaClientInitializationError) {
    return new ErrorException(DAT.CONNECTION_FAILED, {
      message: 'Database initialisation failed',
      cause: error,
    });
  }

  // PrismaClientRustPanicError — unrecoverable engine crash
  if (error instanceof PrismaClientRustPanicError) {
    return new ErrorException(SRV.INTERNAL_ERROR, {
      message: 'Database engine crash',
      cause: error,
    });
  }

  // PrismaClientUnknownRequestError — unknown engine-level error
  if (error instanceof PrismaClientUnknownRequestError) {
    return new ErrorException(DAT.QUERY_FAILED, {
      message: 'Unknown database error',
      cause: error,
    });
  }

  return undefined;
}

/**
 * Higher-order function that wraps an async operation with Prisma error handling.
 *
 * Any Prisma errors thrown by `fn` are converted to ErrorExceptions before being
 * re-thrown. Non-Prisma errors are re-thrown unchanged.
 *
 * @param fn - Async function to execute
 * @returns The result of `fn`
 * @throws ErrorException when a Prisma error is encountered
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
    const errorException = handlePrismaError(error);
    if (errorException) {
      throw errorException;
    }
    throw error;
  }
}
