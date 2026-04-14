import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { trace } from '@opentelemetry/api';
import { ApiSuccessResponse, ApiResponseMeta } from '@common/interfaces/api-response.interface';
import { PaginatedResult } from '@common/interfaces/paginated-result.interface';

/**
 * Type guard: checks if a value is a PaginatedResult (has `data` array and `meta` object).
 */
function isPaginatedResult<T>(value: unknown): value is PaginatedResult<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    Array.isArray((value as Record<string, unknown>)['data']) &&
    'meta' in value &&
    typeof (value as Record<string, unknown>)['meta'] === 'object'
  );
}

/**
 * Interceptor that wraps all successful controller responses into the
 * standard ApiSuccessResponse shape.
 *
 * Detects PaginatedResult payloads and automatically hoists the pagination
 * metadata into the response `meta` field.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiSuccessResponse<T>> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccessResponse<T>> {
    const request = context.switchToHttp().getRequest<Request & { id?: string }>();

    const requestId = request.id ?? '';
    const traceId = trace.getActiveSpan()?.spanContext()?.traceId ?? '';

    return next.handle().pipe(
      map((data) => {
        const timestamp = new Date().toISOString();

        if (isPaginatedResult(data)) {
          const meta: ApiResponseMeta = {
            ...data.meta,
            requestId,
            traceId,
          };

          return {
            success: true,
            data: data.data as unknown as T,
            meta,
            timestamp,
          };
        }

        const meta: ApiResponseMeta = {
          requestId,
          traceId,
        };

        return {
          success: true,
          data,
          meta,
          timestamp,
        };
      }),
    );
  }
}
