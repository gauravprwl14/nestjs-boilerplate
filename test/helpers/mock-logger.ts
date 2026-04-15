/**
 * Creates a mock implementation of AppLogger for use in unit tests.
 */
export const createMockLogger = () => ({
  log: jest.fn(),
  logEvent: jest.fn(),
  logError: jest.fn(),
  addSpanAttributes: jest.fn(),
  child: jest.fn().mockReturnThis(),
  setContext: jest.fn(),
  verbose: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  fatal: jest.fn(),
});
