import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Response } from 'express';
import { handlePrismaError, isPrismaError } from '@errors/handlers/prisma-error.handler';
import { AppError } from '@errors/types/app-error';

/**
 * Exception filter that catches all Prisma errors and converts them to AppErrors.
 *
 * This filter sits before the global AllExceptionsFilter so that Prisma errors
 * are normalised into AppErrors before being processed for HTTP responses.
 */
@Catch()
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    // Only handle Prisma errors; let everything else pass through
    if (!isPrismaError(exception)) {
      throw exception;
    }

    const appError = handlePrismaError(exception);

    if (appError) {
      throw appError;
    }

    // Fallback: wrap as a generic AppError
    throw AppError.wrap(exception);
  }
}
