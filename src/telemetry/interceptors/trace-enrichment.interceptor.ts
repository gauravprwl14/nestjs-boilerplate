import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';
import { trace } from '@opentelemetry/api';
import { ATTR_HTTP_ROUTE, ATTR_URL_PATH } from '@opentelemetry/semantic-conventions';

import { normalisePath } from '@telemetry/utils/path-normalizer';

/**
 * Interceptor that enriches the active HTTP server span with route-level
 * attributes and a cardinality-safe span name.
 *
 * Runs once per request AFTER the Nest router has resolved a controller —
 * at which point Express populates `request.route.path` with the matched
 * route pattern (e.g. `/api/v1/tweets/:id`). We copy that value onto the
 * active span as `http.route` (OTel semconv) and rename the span from the
 * auto-instrumentation default (`POST` / `GET`) to `${METHOD} ${route}`
 * so it is searchable and human-readable in Tempo.
 *
 * `url.path` carries the raw (unresolved) path for debugging.
 *
 * ## Safety
 *
 * Every failure mode is swallowed. Observability code must never turn a
 * successful request into an error — the interceptor delegates immediately
 * to `next.handle()` and wraps its own work in `try/catch`.
 *
 * ## Register order (in main.ts)
 *
 * `TimeoutInterceptor → TraceEnrichmentInterceptor → LoggingInterceptor → TransformInterceptor`
 *
 * The enrichment runs before logging so log records carry the normalised
 * route for cardinality-parity with the span (future WP).
 */
@Injectable()
export class TraceEnrichmentInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    try {
      // Only HTTP requests carry a route/URL — skip gracefully for RPC /
      // WS / GraphQL contexts (switchToHttp returns an empty wrapper but
      // getRequest() may still yield undefined depending on the transport).
      if (context.getType() !== 'http') {
        return next.handle();
      }

      const req = context
        .switchToHttp()
        .getRequest<Request & { route?: { path?: string }; originalUrl?: string }>();
      const span = trace.getActiveSpan();

      if (!span || !req) {
        return next.handle();
      }

      const method = req.method;
      const rawPath = (req.originalUrl ?? req.url ?? '').split('?')[0];
      const resolvedRoute = req.route?.path;

      // Prefer Nest's resolved route pattern; fall back to the normalised
      // raw path when it's missing. The fallback matters for pre-router
      // failures that still produce a server span — in practice only an
      // edge case because most such failures bypass the interceptor entirely.
      const route = resolvedRoute ?? normalisePath(rawPath);

      span.setAttribute(ATTR_HTTP_ROUTE, route);
      span.setAttribute(ATTR_URL_PATH, rawPath);
      span.updateName(`${method} ${route}`);
    } catch {
      // Never throw from an interceptor — losing enrichment on a single
      // request is strictly better than losing the response.
    }

    return next.handle();
  }
}
