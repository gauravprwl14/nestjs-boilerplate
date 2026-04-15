import { InstrumentClassOptions } from '../interfaces/telemetry.interfaces';
import { Trace } from './trace.decorator';

/**
 * Default method names excluded from auto-instrumentation.
 * These are lifecycle/plumbing methods that produce noise with no diagnostic value.
 */
const DEFAULT_EXCLUDED_METHODS = new Set([
  'constructor',
  'onModuleInit',
  'onModuleDestroy',
  'onApplicationBootstrap',
  'onApplicationShutdown',
  'beforeApplicationShutdown',
]);

/**
 * @InstrumentClass() — class decorator that automatically applies @Trace() to
 * every public method on the class prototype.
 *
 * Built-in lifecycle methods (constructor, onModuleInit, etc.) are excluded by
 * default. Additional methods can be excluded via `options.exclude`.
 *
 * @example
 * ```ts
 * @InstrumentClass({ exclude: ['healthCheck'] })
 * @Injectable()
 * export class UserService { ... }
 * ```
 */
export function InstrumentClass(options?: InstrumentClassOptions): ClassDecorator {
  return (target: Function): void => {
    const className = target.name;
    const prefix = options?.prefix ?? className;
    const userExclusions = new Set(options?.exclude ?? []);

    const proto = target.prototype as Record<string, unknown>;

    for (const key of Object.getOwnPropertyNames(proto)) {
      // Skip non-function members.
      if (typeof proto[key] !== 'function') continue;

      // Skip excluded methods.
      if (DEFAULT_EXCLUDED_METHODS.has(key) || userExclusions.has(key)) continue;

      const descriptor = Object.getOwnPropertyDescriptor(proto, key);
      if (!descriptor || !descriptor.value) continue;

      // Apply @Trace with a deterministic span name.
      const traceDecorator = Trace({ spanName: `${prefix}.${key}` });
      traceDecorator(proto, key, descriptor);
      Object.defineProperty(proto, key, descriptor);
    }
  };
}
