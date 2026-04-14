import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { AppError } from '@errors/types/app-error';
import { DEFAULT_REQUEST_TIMEOUT_MS } from '@common/constants/app.constants';

/**
 * Interceptor that applies a request timeout to all routes.
 *
 * Throws AppError GEN0002 (Request timeout) if a handler does not resolve
 * within DEFAULT_REQUEST_TIMEOUT_MS.
 */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      timeout(DEFAULT_REQUEST_TIMEOUT_MS),
      catchError((error: unknown) => {
        if (error instanceof TimeoutError) {
          return throwError(() => AppError.fromCode('GEN0002'));
        }
        return throwError(() => error);
      }),
    );
  }
}
