import { Logger } from '@nestjs/common';
import type { ILogEventOptions, ILogErrorOptions, LogAttributes } from './logger.interfaces';
import type { AppLogger } from './logger.service';

/**
 * Custom methods added to NestJS Logger via delegation to AppLogger.
 * These methods become available on every `new Logger(context)` instance
 * after `initLoggerDelegation()` is called in bootstrap.
 *
 * ## How it works
 *
 * 1. `initLoggerDelegation(appLogger)` is called once in main.ts after DI resolves AppLogger
 * 2. Custom methods (logEvent, logError, addSpanAttributes) are added to Logger.prototype
 * 3. Each method delegates to the stored AppLogger singleton, passing the Logger instance's context
 * 4. Standard methods (log, warn, error, debug, verbose) continue to work via NestJS's built-in
 *    `app.useLogger(appLogger)` mechanism
 *
 * ## Why not modify globalThis?
 *
 * The nao-server approach stores the logger on `globalThis` — a global mutable variable
 * that's fragile, untestable, and has no cleanup. Instead, we use a module-scoped variable
 * which is contained to this module and can be reset in tests.
 *
 * ## Usage in services
 *
 * ```typescript
 * import { Logger } from '@nestjs/common';
 *
 * @Injectable()
 * export class MyService {
 *   private readonly logger = new Logger(MyService.name);
 *
 *   async doWork() {
 *     this.logger.logEvent('work.started', { attributes: { jobId } });
 *     // ...
 *     this.logger.logError('work.failed', error, { attributes: { jobId } });
 *   }
 * }
 * ```
 */

/** Module-scoped reference to the AppLogger singleton */
let appLoggerInstance: AppLogger | null = null;

/**
 * Initializes the Logger → AppLogger delegation.
 * Must be called once during bootstrap, after AppLogger is resolved from DI.
 *
 * @param appLogger - The DI-resolved AppLogger instance
 */
export function initLoggerDelegation(appLogger: AppLogger): void {
  appLoggerInstance = appLogger;

  // Add custom methods to Logger.prototype so all instances get them
  const proto = Logger.prototype as any;

  /**
   * Log a named structured event at INFO level.
   * Delegates to AppLogger.logEvent() with the calling Logger's context.
   */
  proto.logEvent = function (this: Logger, eventName: string, options?: ILogEventOptions): void {
    if (!appLoggerInstance) {
      this.log(`[logEvent] ${eventName}`);
      return;
    }
    // Create a child scoped to this Logger's context
    const scoped = appLoggerInstance.child((this as any).context ?? 'Unknown');
    scoped.logEvent(eventName, options);
  };

  /**
   * Log an error at ERROR level with OTel span exception recording.
   * Delegates to AppLogger.logError() with the calling Logger's context.
   */
  proto.logError = function (
    this: Logger,
    eventName: string,
    error: Error,
    options?: ILogErrorOptions,
  ): void {
    if (!appLoggerInstance) {
      this.error(`[logError] ${eventName}: ${error.message}`);
      return;
    }
    const scoped = appLoggerInstance.child((this as any).context ?? 'Unknown');
    scoped.logError(eventName, error, options);
  };

  /**
   * Add attributes to the active OTel span without logging.
   * Delegates to AppLogger.addSpanAttributes().
   */
  proto.addSpanAttributes = function (this: Logger, attributes: LogAttributes): void {
    if (!appLoggerInstance) return;
    appLoggerInstance.addSpanAttributes(attributes);
  };
}

/**
 * Resets the logger delegation. Used in tests to clean up module state.
 */
export function resetLoggerDelegation(): void {
  appLoggerInstance = null;
  const proto = Logger.prototype as any;
  delete proto.logEvent;
  delete proto.logError;
  delete proto.addSpanAttributes;
}
