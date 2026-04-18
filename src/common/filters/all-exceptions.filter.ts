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
import { ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
import { AppLogger } from '@logger/logger.service';
import { AppConfigService } from '@config/config.service';
import { LogLevel } from '@logger/logger.interfaces';
import { ErrorException } from '@errors/types/error-exception';
import { ErrorCodeDefinition } from '@errors/interfaces/error.interfaces';
import { handlePrismaError, isPrismaError } from '@errors/handlers/prisma-error.handler';
import { GEN, VAL, AUT, AUZ, DAT, SRV } from '@errors/error-codes';
import { ApiErrorResponse } from '@common/interfaces/api-response.interface';
import { RedactorService } from '@common/redaction/redactor.service';
import { recordExceptionOnSpan } from '@telemetry/utils/record-exception.util';
import { normalisePath } from '@telemetry/utils/path-normalizer';

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
    private readonly redactor: RedactorService,
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
    // the failure. The filter is the single authoritative HTTP-span recorder:
    // `recordExceptionOnSpan` emits exactly one `exception` event (plus
    // `exception.cause.N` for nested causes), sets the `error.*` attributes
    // when the error is an ErrorException, and flags the span status as ERROR
    // for every captured failure. The HTTP semconv reserves status=ERROR for
    // 5xx only, but in Tempo the UI hides green (UNSET) rows from the error-
    // filter views — meaning 4xx failures disappear from the incident feed.
    // We deliberately deviate: mark ALL caught errors as ERROR, and add a
    // cardinality-safe `error.class` attribute (`'4xx'` | `'5xx'`) so
    // dashboards can still split legitimate client faults from server faults.
    if (span) {
      recordExceptionOnSpan(error, {
        span,
        setStatus: true,
        redactString: (s): string => this.redactor.redactString(s),
      });
      span.setAttributes({
        [ATTR_HTTP_ROUTE]: this.resolveRoute(request),
        'http.status_code': error.statusCode,
        'http.method': request.method,
        error: true,
        'error.class': error.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR ? '5xx' : '4xx',
      });
    }

    // Log at appropriate level based on HTTP status:
    // 5xx -> ERROR (logError), 4xx -> WARN (log). We pass `recordException: false`
    // because the filter already recorded the exception on the HTTP span above —
    // this is the single authoritative recorder for the HTTP layer.
    if (error.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.logError('http.error', error, {
        recordException: false,
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
   * Resolves the route label for `http.route`. Prefers the router-resolved
   * pattern (`req.route.path`) when present — that is the Nest-canonical
   * value, identical to what the `TraceEnrichmentInterceptor` sets for
   * successful requests. When the router has NOT resolved a pattern (the
   * error was thrown in middleware before the router ran), we fall back to
   * `normalisePath(req.url)` so id-bearing raw URLs don't explode Tempo's
   * cardinality.
   */
  private resolveRoute(req: Request): string {
    const resolved = (req as Request & { route?: { path?: string } }).route?.path;
    if (resolved) return resolved;
    const rawPath = (req.originalUrl ?? req.url ?? '').split('?')[0];
    return normalisePath(rawPath);
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
