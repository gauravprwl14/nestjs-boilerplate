import { INestApplication } from '@nestjs/common';
import { AppLogger } from '@logger/logger.service';
import { LogLevel } from '@logger/logger.interfaces';
import { EXIT_CODE_SUCCESS } from './process-handlers.constants';

/**
 * Gracefully shuts down the NestJS application.
 *
 * Steps:
 * 1. Logs that shutdown has started.
 * 2. Sets a hard-exit timer (unref'd so it won't prevent process exit).
 * 3. Calls app.close() which triggers OnModuleDestroy hooks.
 * 4. Logs that shutdown completed successfully.
 * 5. On error, logs the failure, clears the timer, and exits with code 0.
 *
 * @param app - The NestJS application instance
 * @param logger - Application logger
 * @param signal - The signal that triggered shutdown (e.g. "SIGTERM")
 * @param timeoutMs - Hard-exit timeout in milliseconds
 */
export async function gracefulShutdown(
  app: INestApplication,
  logger: AppLogger,
  signal: string,
  timeoutMs: number,
): Promise<void> {
  logger.logEvent('process.shutdown.started', {
    attributes: { signal, timeoutMs },
  });

  const hardExitTimer = setTimeout(() => {
    logger.log('process.shutdown.timeout', {
      level: LogLevel.WARN,
      attributes: { signal, timeoutMs },
    });
    process.exit(EXIT_CODE_SUCCESS);
  }, timeoutMs);

  // Allow the process to exit even if this timer is still pending
  hardExitTimer.unref();

  try {
    await app.close();

    clearTimeout(hardExitTimer);

    logger.logEvent('process.shutdown.completed', {
      attributes: { signal },
    });

    process.exit(EXIT_CODE_SUCCESS);
  } catch (error: unknown) {
    clearTimeout(hardExitTimer);

    if (error instanceof Error) {
      logger.logError('process.shutdown.error', error, {
        attributes: { signal },
      });
    } else {
      logger.log('process.shutdown.error', {
        level: LogLevel.WARN,
        attributes: { signal, error: String(error) },
      });
    }

    process.exit(EXIT_CODE_SUCCESS);
  }
}
