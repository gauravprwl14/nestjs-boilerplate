import { LogLevel } from './logger.interfaces';

/**
 * Mapping from LogLevel to Pino numeric severity values.
 * Pino uses: trace=10, debug=20, info=30, warn=40, error=50, fatal=60
 */
export const PINO_LEVEL_VALUES: Record<LogLevel, number> = {
  [LogLevel.TRACE]: 10,
  [LogLevel.DEBUG]: 20,
  [LogLevel.INFO]: 30,
  [LogLevel.WARN]: 40,
  [LogLevel.ERROR]: 50,
  [LogLevel.FATAL]: 60,
};

/**
 * Mapping from LogLevel to OpenTelemetry log severity numbers.
 * @see https://opentelemetry.io/docs/specs/otel/logs/data-model/#field-severitynumber
 */
export const OTEL_SEVERITY_MAP: Record<LogLevel, number> = {
  [LogLevel.TRACE]: 1,
  [LogLevel.DEBUG]: 5,
  [LogLevel.INFO]: 9,
  [LogLevel.WARN]: 13,
  [LogLevel.ERROR]: 17,
  [LogLevel.FATAL]: 21,
};

/**
 * Pino redact paths for sensitive data.
 * These fields will be replaced with REDACT_CENSOR in all log output.
 */
export const REDACT_PATHS: readonly string[] = [
  'req.headers.authorization',
  'req.headers["x-api-key"]',
  'req.headers.cookie',
  'req.body.password',
  'req.body.passwordHash',
  'req.body.token',
  'req.body.refreshToken',
  'req.body.ssn',
  'req.body.cardNumber',
  'req.body.cvv',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.refreshToken',
  '*.accessToken',
  '*.apiKey',
  '*.ssn',
  '*.cardNumber',
  '*.cvv',
  '*.secret',
  '*.privateKey',
];

/**
 * The string used to replace redacted values in log output.
 */
export const REDACT_CENSOR = '[REDACTED]';

/**
 * Maximum depth for recursive object serialization in log attributes.
 */
export const MAX_SERIALIZATION_DEPTH = 5;

/**
 * Maximum length for string attribute values before truncation.
 */
export const MAX_ATTRIBUTE_STRING_LENGTH = 1024;
