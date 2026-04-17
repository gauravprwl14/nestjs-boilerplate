import { RequestMethod } from '@nestjs/common';
import { Params } from 'nestjs-pino';
import { REDACT_PATHS, REDACT_CENSOR } from './logger.constants';

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
          paths: REDACT_PATHS as string[],
          censor: REDACT_CENSOR,
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

  // Production: structured JSON
  return {
    forRoutes: PINO_FOR_ROUTES,
    pinoHttp: {
      level: logLevel,
      redact: {
        paths: REDACT_PATHS as string[],
        censor: REDACT_CENSOR,
      },
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
