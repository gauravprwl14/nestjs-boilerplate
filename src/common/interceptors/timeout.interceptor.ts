import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { ErrorException } from '@errors/types/error-exception';
import { GEN } from '@errors/error-codes';
import { DEFAULT_REQUEST_TIMEOUT_MS } from '@common/constants/app.constants';

/**
 * Interceptor that applies a request timeout to all routes.
 *
 * Throws ErrorException GEN.REQUEST_TIMEOUT (GEN0002) if a handler does not resolve
 * within DEFAULT_REQUEST_TIMEOUT_MS milliseconds.
 */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      timeout(DEFAULT_REQUEST_TIMEOUT_MS),
      catchError((error: unknown) => {
        if (error instanceof TimeoutError) {
          return throwError(() => new ErrorException(GEN.REQUEST_TIMEOUT));
        }
        return throwError(() => error);
      }),
    );
  }
}
