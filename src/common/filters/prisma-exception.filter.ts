import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { handlePrismaError, isPrismaError } from '@errors/handlers/prisma-error.handler';
import { ErrorException } from '@errors/types/error-exception';

/**
 * Exception filter that catches all Prisma errors and converts them to ErrorExceptions.
 *
 * This filter sits before the global AllExceptionsFilter so that Prisma errors
 * are normalised into ErrorExceptions before being processed for HTTP responses.
 */
@Catch()
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, _host: ArgumentsHost): void {
    // Only handle Prisma errors; let everything else pass through
    if (!isPrismaError(exception)) {
      throw exception;
    }

    const errorException = handlePrismaError(exception);

    if (errorException) {
      throw errorException;
    }

    // Fallback: wrap as a generic ErrorException
    throw ErrorException.wrap(exception);
  }
}
