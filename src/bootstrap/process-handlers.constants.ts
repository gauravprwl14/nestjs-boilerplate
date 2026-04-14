export const EXIT_CODE_SUCCESS = 0;
export const EXIT_CODE_UNCAUGHT_EXCEPTION = 1;
export const DEFAULT_HARD_EXIT_TIMEOUT_MS = 10_000;
export const HANDLED_SIGNALS = ['SIGTERM', 'SIGINT'] as const;
export const PROCESS_EVENT = {
  UNCAUGHT_EXCEPTION: 'uncaughtException',
  UNHANDLED_REJECTION: 'unhandledRejection',
  WARNING: 'warning',
} as const;
