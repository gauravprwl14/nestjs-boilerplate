import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AppLogger } from '@logger/logger.service';

/**
 * Interceptor that logs HTTP request completion and failure events.
 *
 * Logs `http.request.completed` on success with method, URL, status code, and
 * duration; logs `http.request.failed` on error.
 *
 * Span-side work lives in {@link AllExceptionsFilter} — it is the single
 * authoritative HTTP-span exception recorder. This interceptor explicitly
 * opts out of `recordExceptionOnSpan` (via `recordException: false` on
 * `logError`) so each failed request produces exactly one `exception` event
 * on its server span instead of two.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLogger) {
    this.logger.setContext(LoggingInterceptor.name);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const start = Date.now();

    const { method, url } = request;

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - start;
          this.logger.logEvent('http.request.completed', {
            attributes: {
              method,
              url,
              statusCode: response.statusCode,
              duration,
            },
          });
        },
        error: (error: unknown) => {
          const duration = Date.now() - start;
          const err = error instanceof Error ? error : new Error(String(error));
          // Pino-only: the filter owns the HTTP-span exception event. Passing
          // `recordException: false` prevents the logger from also emitting
          // one here, which would produce duplicate events on the same span.
          this.logger.logError('http.request.failed', err, {
            recordException: false,
            attributes: {
              method,
              url,
              duration,
            },
          });
        },
      }),
    );
  }
}
