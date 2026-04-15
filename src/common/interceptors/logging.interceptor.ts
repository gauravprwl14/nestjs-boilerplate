import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AppLogger } from '@logger/logger.service';

/**
 * Interceptor that logs HTTP request completion and failure events.
 *
 * Logs `http.request.completed` on success with method, URL, status code, and
 * duration; logs `http.request.failed` on error.
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
          if (error instanceof Error) {
            this.logger.logError('http.request.failed', error, {
              attributes: {
                method,
                url,
                duration,
              },
            });
          } else {
            this.logger.logError('http.request.failed', new Error(String(error)), {
              attributes: {
                method,
                url,
                duration,
              },
            });
          }
        },
      }),
    );
  }
}
