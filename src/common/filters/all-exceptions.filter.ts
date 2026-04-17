import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { AppLogger } from '@logger/logger.service';
import { AppConfigService } from '@config/config.service';
import { LogLevel } from '@logger/logger.interfaces';
import { ErrorException } from '@errors/types/error-exception';
import { ErrorCodeDefinition } from '@errors/interfaces/error.interfaces';
import { handlePrismaError, isPrismaError } from '@errors/handlers/prisma-error.handler';
import { GEN, VAL, AUT, AUZ, DAT, SRV } from '@errors/error-codes';
import { ApiErrorResponse } from '@common/interfaces/api-response.interface';

/**
 * Global exception filter that catches all unhandled exceptions and converts
 * them to a standardised ApiErrorResponse shape.
 *
 * The filter is intentionally thin — ErrorException.toResponse() does the
 * heavy lifting of building the response body, masking non-userFacing
 * messages, and extracting the cause chain.
 */
@Catch()
@Injectable()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly logger: AppLogger,
    private readonly config: AppConfigService,
  ) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    // Extract request/trace IDs for correlation
    const requestId = (request as Request & { id?: string }).id ?? '';
    const span = trace.getActiveSpan();
    const traceId = span?.spanContext()?.traceId ?? '';

    // Normalise the exception to an ErrorException
    const error = this.normalise(exception);

    // Attribute the error to the active HTTP server span so the trace carries
    // the failure. Without this, errors thrown in middleware (e.g. MockAuth's
    // AUT.UNAUTHENTICATED) or anywhere else reach the filter, but the span
    // looks successful in Tempo — no exception event, no error status, no
    // error.* attributes. That breaks the Traces Drilldown error panels and
    // any TraceQL error queries.
    if (span) {
      const cause = exception instanceof Error ? exception : new Error(String(exception));
      span.recordException(cause);
      span.setAttributes({
        'error.code': error.code,
        'error.type': error.definition.errorType,
        'error.category': error.definition.errorCategory,
        'http.status_code': error.statusCode,
        'http.method': request.method,
        'http.url': request.url,
      });
      // Per OTel HTTP semconv: only 5xx should mark the server span as ERROR.
      // 4xx is a correctly-rejected client request, not a server fault.
      if (error.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      }
    }

    // Log at appropriate level based on HTTP status:
    // 5xx -> ERROR (logError), 4xx -> WARN (log)
    if (error.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.logError('http.error', error, {
        attributes: {
          requestId,
          'http.status': error.statusCode,
          'http.method': request.method,
          'http.url': request.url,
        },
      });
    } else {
      this.logger.log('http.error', {
        level: LogLevel.WARN,
        attributes: {
          requestId,
          errorCode: error.code,
          'http.status': error.statusCode,
          'http.method': request.method,
          'http.url': request.url,
        },
      });
    }

    // ErrorException builds its own response — filter is thin
    const includeChain = !this.config.isProduction;
    const body: ApiErrorResponse = {
      success: false,
      errors: [error.toResponse(includeChain)],
      requestId: requestId || undefined,
      traceId: traceId || undefined,
      timestamp: new Date().toISOString(),
    };

    response.status(error.statusCode).json(body);
  }

  /**
   * Converts any thrown value into an ErrorException.
   */
  private normalise(exception: unknown): ErrorException {
    // Already our error — pass through
    if (ErrorException.isErrorException(exception)) {
      return exception;
    }

    // Prisma errors — convert via the shared handler
    if (isPrismaError(exception)) {
      const prismaError = handlePrismaError(exception);
      if (prismaError) return prismaError;
    }

    // NestJS HttpException — FALLBACK only for exceptions not thrown by our code
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const httpResponse = exception.getResponse();
      let message = exception.message;

      if (typeof httpResponse === 'string') {
        message = httpResponse;
      } else {
        const responseMessage = (httpResponse as Record<string, unknown>)?.message;
        if (Array.isArray(responseMessage)) {
          message = responseMessage.join(', ');
        } else if (typeof responseMessage === 'string') {
          message = responseMessage;
        } else if (typeof responseMessage === 'number' || typeof responseMessage === 'boolean') {
          message = String(responseMessage);
        }
      }

      const fallbackDef = findDefinitionByStatus(status);
      return new ErrorException(fallbackDef, { message, cause: exception });
    }

    return ErrorException.wrap(exception);
  }
}

/**
 * Simple fallback: map HTTP status to a definition.
 * Only used for non-ErrorException HttpExceptions.
 */
function findDefinitionByStatus(status: number): ErrorCodeDefinition {
  const map: Record<number, ErrorCodeDefinition> = {
    400: VAL.INVALID_INPUT,
    401: AUT.UNAUTHENTICATED,
    403: AUZ.FORBIDDEN,
    404: DAT.NOT_FOUND,
    408: GEN.REQUEST_TIMEOUT,
    409: DAT.CONFLICT,
    429: GEN.RATE_LIMITED,
    503: GEN.SERVICE_UNAVAILABLE,
  };
  return map[status] ?? SRV.INTERNAL_ERROR;
}
