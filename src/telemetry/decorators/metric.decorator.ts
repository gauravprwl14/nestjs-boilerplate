import { metrics } from '@opentelemetry/api';
import { CounterOptions, DurationOptions } from '../interfaces/telemetry.interfaces';
import { METER_NAME, METRIC_COUNTER_DEFAULT, METRIC_DURATION_DEFAULT } from '../otel.constants';

/**
 * @IncrementCounter() — method decorator that increments a named OTel counter
 * each time the decorated method is called.
 *
 * The counter is incremented after the method completes (both success and error).
 * An additional `success` attribute is attached based on whether the call threw.
 *
 * @example
 * ```ts
 * @IncrementCounter({ name: 'user.login.count', attributes: { provider: 'local' } })
 * async login(dto: LoginDto) { ... }
 * ```
 */
export function IncrementCounter(options?: CounterOptions): MethodDecorator {
  return (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor => {
    const originalMethod = descriptor.value as (...args: unknown[]) => unknown;
    const metricName = options?.name ?? METRIC_COUNTER_DEFAULT;

    descriptor.value = function (...args: unknown[]): unknown {
      const meter = metrics.getMeter(METER_NAME);
      const counter = meter.createCounter(metricName, {
        description: options?.description,
        unit: options?.unit,
      });

      const recordMetric = (success: boolean): void => {
        counter.add(options?.delta ?? 1, {
          ...options?.attributes,
          success: String(success),
        });
      };

      try {
        const result = originalMethod.apply(this, args);

        if (result instanceof Promise) {
          return result
            .then((value: unknown) => {
              recordMetric(true);
              return value;
            })
            .catch((err: unknown) => {
              recordMetric(false);
              throw err;
            });
        }

        recordMetric(true);
        return result;
      } catch (err) {
        recordMetric(false);
        throw err;
      }
    };

    return descriptor;
  };
}

/**
 * @RecordDuration() — method decorator that measures and records the execution
 * duration of the decorated method as an OTel histogram observation.
 *
 * Duration is recorded in milliseconds. The observation includes a `success`
 * attribute to distinguish successful and failed invocations.
 *
 * @example
 * ```ts
 * @RecordDuration({ name: 'db.query.duration', unit: 'ms' })
 * async findUser(id: string) { ... }
 * ```
 */
export function RecordDuration(options?: DurationOptions): MethodDecorator {
  return (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor => {
    const originalMethod = descriptor.value as (...args: unknown[]) => unknown;
    const metricName = options?.name ?? METRIC_DURATION_DEFAULT;

    descriptor.value = function (...args: unknown[]): unknown {
      const meter = metrics.getMeter(METER_NAME);
      const histogram = meter.createHistogram(metricName, {
        description: options?.description,
        unit: options?.unit ?? 'ms',
      });

      const start = performance.now();

      const recordMetric = (success: boolean): void => {
        const durationMs = performance.now() - start;
        histogram.record(durationMs, {
          ...options?.attributes,
          success: String(success),
        });
      };

      try {
        const result = originalMethod.apply(this, args);

        if (result instanceof Promise) {
          return result
            .then((value: unknown) => {
              recordMetric(true);
              return value;
            })
            .catch((err: unknown) => {
              recordMetric(false);
              throw err;
            });
        }

        recordMetric(true);
        return result;
      } catch (err) {
        recordMetric(false);
        throw err;
      }
    };

    return descriptor;
  };
}
