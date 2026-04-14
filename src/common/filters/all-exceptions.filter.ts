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
import { AppError } from '@errors/types/app-error';
import { ApiErrorResponse } from '@common/interfaces/api-response.interface';

/**
 * Maps HTTP status codes to application error codes.
 */
const STATUS_TO_ERROR_CODE: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'VAL0001',
  [HttpStatus.UNAUTHORIZED]: 'AUT0001',
  [HttpStatus.FORBIDDEN]: 'AUZ0001',
  [HttpStatus.NOT_FOUND]: 'DAT0001',
  [HttpStatus.CONFLICT]: 'DAT0002',
  [HttpStatus.REQUEST_TIMEOUT]: 'GEN0002',
  [HttpStatus.TOO_MANY_REQUESTS]: 'GEN0001',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'GEN0003',
};

/**
 * Global exception filter that catches all unhandled exceptions and converts
 * them to a standardised ApiErrorResponse shape.
 *
 * Handles three categories:
 * 1. AppError — already normalised, use as-is
 * 2. HttpException — map HTTP status to error code
 * 3. Unknown — wrap with AppError.wrap() as a generic internal error
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
    const traceId =
      trace.getActiveSpan()?.spanContext()?.traceId ?? '';

    // Normalise the exception to an AppError
    const appError = this.normalise(exception);

    // Log at appropriate level
    const is5xx = appError.statusCode >= 500;
    if (is5xx) {
      this.logger.logError('http.request.failed', appError, {
        level: LogLevel.ERROR,
        attributes: {
          requestId,
          traceId,
          statusCode: appError.statusCode,
          method: request.method,
          url: request.url,
        },
      });
    } else {
      this.logger.logError('http.request.failed', appError, {
        level: LogLevel.WARN,
        attributes: {
          requestId,
          traceId,
          statusCode: appError.statusCode,
          method: request.method,
          url: request.url,
        },
      });
    }

    const body: ApiErrorResponse = {
      success: false,
      error: appError.toResponse(requestId, traceId),
      timestamp: new Date().toISOString(),
    };

    response.status(appError.statusCode).json(body);
  }

  /**
   * Converts any thrown value into an AppError.
   */
  private normalise(exception: unknown): AppError {
    if (AppError.isAppError(exception)) {
      return exception;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const codeKey = STATUS_TO_ERROR_CODE[status] ?? 'SRV0001';
      const response = exception.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : (response as Record<string, unknown>)['message']
            ? String((response as Record<string, unknown>)['message'])
            : exception.message;

      return AppError.fromCode(codeKey as Parameters<typeof AppError.fromCode>[0], {
        message,
        cause: exception,
      });
    }

    return AppError.wrap(exception);
  }
}
