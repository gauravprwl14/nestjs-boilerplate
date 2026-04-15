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
 * - requestId and traceId are placed at the ROOT level of the response (not inside meta).
 * - Detects PaginatedResult payloads and automatically hoists the pagination
 *   metadata into the response `meta` field.
 *
 * Response shape:
 * ```json
 * {
 *   "success": true,
 *   "data": { ... },
 *   "meta": { "total": 100, "page": 1, ... },
 *   "requestId": "...",
 *   "traceId": "...",
 *   "timestamp": "..."
 * }
 * ```
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiSuccessResponse<T>> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccessResponse<T>> {
    const request = context.switchToHttp().getRequest<Request & { id?: string }>();

    const requestId = request.id || undefined;
    const traceId = trace.getActiveSpan()?.spanContext()?.traceId || undefined;

    return next.handle().pipe(
      map((data) => {
        const timestamp = new Date().toISOString();

        if (isPaginatedResult(data)) {
          // Hoist pagination meta — without requestId/traceId (they are at root)
          const meta: ApiResponseMeta = { ...data.meta };

          return {
            success: true,
            data: data.data as unknown as T,
            meta,
            requestId,
            traceId,
            timestamp,
          };
        }

        return {
          success: true,
          data,
          requestId,
          traceId,
          timestamp,
        };
      }),
    );
  }
}
