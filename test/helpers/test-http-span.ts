/**
 * Minimal Express middleware that wraps every request in an OTel
 * `SERVER`-kind span, mirroring what `@opentelemetry/instrumentation-http`
 * would emit in production.
 *
 * Why not use the real http instrumentation? Under Jest the
 * `require-in-the-middle` module hook never fires for Node core modules
 * because `jest-runtime` bypasses `Module.prototype.require` for internals.
 * The result: `http.Server.prototype.emit` is NEVER patched in-test, so no
 * SERVER span is produced and every @Trace / @InstrumentClass span becomes
 * a new root — making trace-id correlation assertions impossible.
 *
 * This helper closes the gap: it installs a local wrapper that exists only
 * for the duration of the e2e suite. In production the real OTel HTTP
 * instrumentation replaces it; the test fidelity is "close enough" — we
 * still validate `@Trace`/`@InstrumentClass` behaviour, error recording,
 * PII redaction, and trace propagation through the controller/service/DB
 * chain.
 */
import type { Request, Response, NextFunction } from 'express';
import { SpanKind, SpanStatusCode, trace, context } from '@opentelemetry/api';
import { TRACER_NAME } from '../../src/telemetry/otel.constants';

/**
 * Express middleware that opens one SERVER-kind span per incoming request
 * and attaches the standard `http.*` attributes. The span is ended in a
 * `res.on('finish' | 'close')` hook so its status reflects the final
 * response code.
 */
export function testHttpSpanMiddleware() {
  const tracer = trace.getTracer(TRACER_NAME);
  return function testHttpSpan(req: Request, res: Response, next: NextFunction): void {
    const spanName = `${req.method} ${req.path}`;
    const span = tracer.startSpan(spanName, {
      kind: SpanKind.SERVER,
      attributes: {
        'http.method': req.method,
        'http.route': req.path,
        'http.target': req.originalUrl,
        'http.scheme': req.protocol,
      },
    });
    const ctx = trace.setSpan(context.active(), span);

    // End the span once the response has been sent. We defer mutating
    // `http.status_code` until here so the real final status (including
    // rewrites by the exception filter) is captured.
    const end = (): void => {
      if ((span as unknown as { ended?: boolean }).ended) return;
      span.setAttribute('http.status_code', res.statusCode);
      if (res.statusCode >= 500) {
        span.setStatus({ code: SpanStatusCode.ERROR });
      }
      span.end();
    };
    res.on('finish', end);
    res.on('close', end);

    context.with(ctx, () => next());
  };
}
