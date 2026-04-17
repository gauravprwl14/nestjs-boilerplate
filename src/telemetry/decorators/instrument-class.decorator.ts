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
 * every method on the class prototype, including methods inherited from
 * parent classes (the prototype chain is walked up to `Object.prototype`).
 *
 * A method is wrapped exactly once: the nearest-subclass override wins, so
 * overrides in subclasses are traced with the subclass's span name and
 * parent-only methods are traced with the parent's.
 *
 * Built-in lifecycle methods (constructor, onModuleInit, etc.) are excluded
 * by default. Additional methods can be excluded via `options.exclude`.
 *
 * @example
 * ```ts
 * @InstrumentClass({ exclude: ['healthCheck'] })
 * @Injectable()
 * export class UserService { ... }
 * ```
 */
export function InstrumentClass(options?: InstrumentClassOptions): ClassDecorator {
  return (target: { prototype: unknown; name: string }): void => {
    const className = target.name;
    const prefix = options?.prefix ?? className;
    const userExclusions = new Set(options?.exclude ?? []);

    const proto = target.prototype as object | null;
    if (!proto) return;

    // Track every key we've seen so subclass overrides win over parents,
    // and so the same key is never wrapped twice.
    const seen = new Set<string>();
    // Preload the skip set with all auto-excluded lifecycle names plus any
    // user-supplied exclusions — these must never be wrapped, not even when
    // they appear on a parent class further up the chain.
    for (const name of DEFAULT_EXCLUDED_METHODS) seen.add(name);
    for (const name of userExclusions) seen.add(name);

    let current: object | null = proto;
    while (current && current !== Object.prototype) {
      for (const key of Object.getOwnPropertyNames(current)) {
        if (seen.has(key)) continue;
        seen.add(key);

        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        // Skip accessors (get/set) and non-function properties.
        if (!descriptor || typeof descriptor.value !== 'function') continue;

        // Apply @Trace with a deterministic span name scoped to the declaring
        // class's prefix, and install the wrapped descriptor on the *subclass*
        // prototype so `this` continues to resolve to the concrete instance.
        const traceDecorator = Trace({ spanName: `${prefix}.${key}` });
        traceDecorator(proto, key, descriptor);
        Object.defineProperty(proto, key, descriptor);
      }
      current = Object.getPrototypeOf(current);
    }
  };
}
