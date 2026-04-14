import { INestApplication } from '@nestjs/common';
import { AppLogger } from '@logger/logger.service';
import { LogLevel } from '@logger/logger.interfaces';
import { gracefulShutdown } from './graceful-shutdown';
import {
  EXIT_CODE_UNCAUGHT_EXCEPTION,
  HANDLED_SIGNALS,
  PROCESS_EVENT,
} from './process-handlers.constants';

/**
 * Registers global process-level event handlers for the application.
 *
 * Handles:
 * - SIGTERM / SIGINT → graceful shutdown
 * - uncaughtException → log FATAL, exit(1) after brief delay
 * - unhandledRejection → log ERROR (no exit — considered recoverable)
 * - warning → log WARN
 *
 * @param app - The NestJS application instance
 * @param logger - Application logger
 * @param shutdownTimeoutMs - Graceful shutdown timeout in milliseconds
 */
export function setupProcessHandlers(
  app: INestApplication,
  logger: AppLogger,
  shutdownTimeoutMs: number,
): void {
  // ─── Graceful shutdown signals ──────────────────────────────────────────────

  for (const signal of HANDLED_SIGNALS) {
    process.on(signal, () => {
      void gracefulShutdown(app, logger, signal, shutdownTimeoutMs);
    });
  }

  // ─── Uncaught exception ─────────────────────────────────────────────────────

  process.on(PROCESS_EVENT.UNCAUGHT_EXCEPTION, (error: Error) => {
    logger.logError('process.uncaughtException', error, {
      level: LogLevel.FATAL,
      attributes: { fatal: true },
    });

    // Give the logger a tick to flush before exiting
    setTimeout(() => {
      process.exit(EXIT_CODE_UNCAUGHT_EXCEPTION);
    }, 500).unref();
  });

  // ─── Unhandled promise rejection ────────────────────────────────────────────

  process.on(PROCESS_EVENT.UNHANDLED_REJECTION, (reason: unknown) => {
    const error =
      reason instanceof Error ? reason : new Error(String(reason));

    logger.logError('process.unhandledRejection', error, {
      level: LogLevel.ERROR,
    });
    // No process.exit — unhandled rejections are considered recoverable
  });

  // ─── Process warning ────────────────────────────────────────────────────────

  process.on(PROCESS_EVENT.WARNING, (warning: Error) => {
    logger.logEvent('process.warning', {
      level: LogLevel.WARN,
      attributes: {
        name: warning.name,
        message: warning.message,
      },
    });
  });

  // ─── Registration confirmation ──────────────────────────────────────────────

  logger.logEvent('process.handlers.registered', {
    level: LogLevel.INFO,
    attributes: {
      signals: HANDLED_SIGNALS.join(','),
      shutdownTimeoutMs,
    },
  });
}
