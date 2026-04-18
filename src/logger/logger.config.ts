import { RequestMethod } from '@nestjs/common';
import { Params } from 'nestjs-pino';
import { trace, isSpanContextValid } from '@opentelemetry/api';
import { DEFAULT_PII_PATHS } from '@common/redaction/pii-registry';
import { REDACTION_CENSOR } from '@common/redaction/redaction.constants';

/**
 * Route matcher for the pino-http middleware. nestjs-pino defaults to
 * `{ path: '*', method: ALL }`, which NestJS 11 + Express 5 + path-to-regexp
 * v8 flag as legacy (`Unsupported route path: "/api/*"` warning). The
 * named-wildcard form below is the v8 equivalent and suppresses the warning.
 */
const PINO_FOR_ROUTES: Params['forRoutes'] = [{ path: '{*splat}', method: RequestMethod.ALL }];

/**
 * Options for the Pino config factory.
 */
export interface PinoConfigOptions {
  /** Service/application name included in every log line. */
  serviceName: string;
  /** Pino log level string (e.g. 'info', 'debug'). */
  logLevel: string;
  /** Whether the application is running in development mode. */
  isDevelopment: boolean;
}

/**
 * Factory function that creates nestjs-pino Params based on runtime config.
 *
 * - Development: pretty-printed colourized output via pino-pretty.
 * - Production: structured JSON with formatters, serializers, and redaction.
 */
export function createPinoConfig(options: PinoConfigOptions): Params {
  const { serviceName, logLevel, isDevelopment } = options;

  if (isDevelopment) {
    return {
      forRoutes: PINO_FOR_ROUTES,
      pinoHttp: {
        level: logLevel,
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            singleLine: false,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
        redact: {
          // Spread the frozen registry into a mutable array — fast-redact
          // mutates its `paths` option when building the internal state.
          paths: [...DEFAULT_PII_PATHS],
          censor: REDACTION_CENSOR,
        },
        mixin: traceContextMixin,
        serializers: {
          req(req: { method: string; url: string; headers: Record<string, string> }) {
            return {
              method: req.method,
              url: req.url,
              headers: {
                'user-agent': req.headers['user-agent'],
                'content-type': req.headers['content-type'],
                'x-request-id': req.headers['x-request-id'],
              },
            };
          },
          res(res: { statusCode: number }) {
            return {
              statusCode: res.statusCode,
            };
          },
        },
        customProps: () => ({
          service: serviceName,
        }),
      },
    };
  }

  // Production: structured JSON
  return {
    forRoutes: PINO_FOR_ROUTES,
    pinoHttp: {
      level: logLevel,
      redact: {
        // Spread the frozen registry into a mutable array — fast-redact
        // mutates its `paths` option when building the internal state.
        paths: [...DEFAULT_PII_PATHS],
        censor: REDACTION_CENSOR,
      },
      mixin: traceContextMixin,
      formatters: {
        level(label: string) {
          return { level: label };
        },
        bindings(bindings: Record<string, unknown>) {
          return {
            pid: bindings['pid'],
            hostname: bindings['hostname'],
            service: serviceName,
          };
        },
        log(object: Record<string, unknown>) {
          return object;
        },
      },
      serializers: {
        req(req: { method: string; url: string; headers: Record<string, string> }) {
          return {
            method: req.method,
            url: req.url,
            headers: {
              'user-agent': req.headers['user-agent'],
              'content-type': req.headers['content-type'],
              'x-request-id': req.headers['x-request-id'],
            },
          };
        },
        res(res: { statusCode: number }) {
          return {
            statusCode: res.statusCode,
          };
        },
      },
      customProps: () => ({
        service: serviceName,
      }),
    },
  };
}

/**
 * Pino `mixin` that stamps every log record with the active OTel span context
 * so Loki/Tempo can correlate logs ↔ traces without per-callsite plumbing.
 *
 * Returns an empty object when there is no active span (e.g. bootstrap logs)
 * or when the context is invalid, so Pino's output stays untouched.
 *
 * `trace_flags` is emitted as a two-hex-digit string (`'01'`, `'00'`) to
 * match the W3C trace-context serialisation used by collectors.
 */
function traceContextMixin(): Record<string, string> {
  const span = trace.getActiveSpan();
  const ctx = span?.spanContext();
  if (!ctx || !isSpanContextValid(ctx)) return {};
  return {
    trace_id: ctx.traceId,
    span_id: ctx.spanId,
    trace_flags: `0${ctx.traceFlags.toString(16)}`,
  };
}
