import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { trace } from '@opentelemetry/api';
import { AppLogger } from '@logger/logger.service';
import { LogLevel } from '@logger/logger.interfaces';
import { ErrorException } from '@errors/types/error-exception';
import { handlePrismaError, isPrismaError } from '@errors/handlers/prisma-error.handler';
import { ApiErrorResponse } from '@common/interfaces/api-response.interface';

/**
 * Maps HTTP status codes to domain error code keys for generic HttpExceptions.
 * These are used when a plain NestJS HttpException is thrown (not an ErrorException).
 */
const STATUS_TO_ERROR_KEY: Record<number, Parameters<typeof ErrorException.fromCode>[0]> = {
  [HttpStatus.BAD_REQUEST]: 'VAL.INVALID_INPUT',
  [HttpStatus.UNAUTHORIZED]: 'AUT.UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'AUZ.FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'DAT.NOT_FOUND',
  [HttpStatus.CONFLICT]: 'DAT.CONFLICT',
  [HttpStatus.REQUEST_TIMEOUT]: 'GEN.REQUEST_TIMEOUT',
  [HttpStatus.TOO_MANY_REQUESTS]: 'GEN.RATE_LIMITED',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'GEN.SERVICE_UNAVAILABLE',
};

/**
 * Global exception filter that catches all unhandled exceptions and converts
 * them to a standardised ApiErrorResponse shape.
 *
 * Handles three categories:
 * 1. ErrorException — already normalised, use as-is
 * 2. HttpException — map HTTP status to error key
 * 3. Unknown — wrap with ErrorException.wrap() as a generic internal error
 *
 * Response shape:
 * ```json
 * {
 *   "success": false,
 *   "errors": [{ "code": "VAL0001", "message": "..." }],
 *   "requestId": "...",
 *   "traceId": "...",
 *   "timestamp": "..."
 * }
 * ```
 */
@Catch()
@Injectable()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    // Extract request/trace IDs for correlation
    const requestId = (request as Request & { id?: string }).id ?? '';
    const traceId = trace.getActiveSpan()?.spanContext()?.traceId ?? '';

    // Normalise the exception to an ErrorException
    const errorException = this.normalise(exception);

    // Log at appropriate level based on HTTP status:
    // 5xx → ERROR (logError), 4xx → WARN (log)
    const is5xx = errorException.statusCode >= 500;
    const errorAttrs = {
      requestId,
      traceId,
      statusCode: errorException.statusCode,
      method: request.method,
      url: request.url,
    };

    if (is5xx) {
      this.logger.logError('http.request.failed', errorException, {
        attributes: errorAttrs,
      });
    } else {
      this.logger.log('http.request.failed', {
        level: LogLevel.WARN,
        attributes: errorAttrs,
      });
    }

    const body: ApiErrorResponse = {
      success: false,
      errors: [errorException.toResponse()],
      requestId: requestId || undefined,
      traceId: traceId || undefined,
      timestamp: new Date().toISOString(),
    };

    response.status(errorException.statusCode).json(body);
  }

  /**
   * Converts any thrown value into an ErrorException.
   *
   * @param exception - The caught exception
   * @returns A normalised ErrorException
   */
  private normalise(exception: unknown): ErrorException {
    if (ErrorException.isErrorException(exception)) {
      return exception;
    }

    // Prisma errors — convert via the shared handler
    if (isPrismaError(exception)) {
      const prismaError = handlePrismaError(exception);
      if (prismaError) return prismaError;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const errorKey = STATUS_TO_ERROR_KEY[status] ?? 'SRV.INTERNAL_ERROR';
      const httpResponse = exception.getResponse();
      const message =
        typeof httpResponse === 'string'
          ? httpResponse
          : (httpResponse as Record<string, unknown>)['message']
            ? String((httpResponse as Record<string, unknown>)['message'])
            : exception.message;

      return ErrorException.fromCode(errorKey, {
        message,
        cause: exception,
      });
    }

    return ErrorException.wrap(exception);
  }
}
