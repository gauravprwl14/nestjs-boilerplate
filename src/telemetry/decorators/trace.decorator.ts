import { trace, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { TraceOptions } from '../interfaces/telemetry.interfaces';
import { TRACER_NAME, SPAN_ATTR_CLASS, SPAN_ATTR_METHOD } from '../otel.constants';

/**
 * @Trace() — method decorator that wraps the decorated method in an active OTel span.
 *
 * The span is automatically ended when the method returns (or rejects/throws).
 * Errors are recorded on the span and re-thrown unchanged — this decorator is
 * completely transparent to the caller.
 *
 * Works for both synchronous and async methods.
 *
 * @example
 * ```ts
 * @Trace({ spanName: 'user.create' })
 * async createUser(dto: CreateUserDto) { ... }
 * ```
 */
export function Trace(options?: TraceOptions): MethodDecorator {
  return (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor => {
    const originalMethod = descriptor.value as (...args: unknown[]) => unknown;
    const methodName = String(propertyKey);
    const className = target.constructor?.name ?? 'Unknown';

    descriptor.value = function (...args: unknown[]): unknown {
      const tracer = trace.getTracer(TRACER_NAME);
      const spanName = options?.spanName ?? `${className}.${methodName}`;

      const spanAttributes: Record<string, string> = {
        [SPAN_ATTR_CLASS]: className,
        [SPAN_ATTR_METHOD]: methodName,
        ...(options?.attributes as Record<string, string> | undefined),
      };

      return tracer.startActiveSpan(
        spanName,
        {
          kind: options?.kind ?? SpanKind.INTERNAL,
          attributes: spanAttributes,
          root: options?.root,
        },
        (span) => {
          const handleError = (err: unknown): never => {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: err instanceof Error ? err.message : String(err),
            });
            if (err instanceof Error) {
              span.recordException(err);
            }
            span.end();
            throw err;
          };

          try {
            const result = originalMethod.apply(this, args);

            // Async path: wait for the promise, then end the span.
            if (result instanceof Promise) {
              return result
                .then((value: unknown) => {
                  span.setStatus({ code: SpanStatusCode.OK });
                  span.end();
                  return value;
                })
                .catch(handleError);
            }

            // Sync path: end the span immediately.
            span.setStatus({ code: SpanStatusCode.OK });
            span.end();
            return result;
          } catch (err) {
            return handleError(err);
          }
        },
      );
    };

    return descriptor;
  };
}
