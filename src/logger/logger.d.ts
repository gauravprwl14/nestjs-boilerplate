import type { ILogEventOptions, ILogErrorOptions, LogAttributes } from './logger.interfaces';

/**
 * Augments NestJS Logger with custom methods delegated to AppLogger.
 * These methods are available on all `new Logger(context)` instances
 * after `initLoggerDelegation()` is called in bootstrap.
 *
 * @example
 * ```typescript
 * import { Logger } from '@nestjs/common';
 *
 * const logger = new Logger('MyService');
 * logger.logEvent('user.created', { attributes: { userId } });
 * logger.logError('payment.failed', error, { attributes: { orderId } });
 * logger.addSpanAttributes({ 'request.id': requestId });
 * ```
 */
declare module '@nestjs/common' {
  interface Logger {
    /**
     * Log a named structured event at INFO level.
     * Adds an OTel span event unless logOnly is set.
     */
    logEvent(eventName: string, options?: ILogEventOptions): void;

    /**
     * Log an error at ERROR level with OTel span exception recording.
     */
    logError(eventName: string, error: Error, options?: ILogErrorOptions): void;

    /**
     * Add attributes to the active OTel span without logging.
     */
    addSpanAttributes(attributes: LogAttributes): void;
  }
}
