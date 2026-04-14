/**
 * Domain-prefixed error codes.
 * Format: PREFIX + 4-digit number.
 * Every unique error scenario MUST have a unique code.
 */
export const ERROR_CODES = {
  // === GEN: General ===
  GEN0001: { code: 'GEN0001', message: 'Rate limit exceeded', statusCode: 429 },
  GEN0002: { code: 'GEN0002', message: 'Request timeout', statusCode: 408 },
  GEN0003: { code: 'GEN0003', message: 'Service unavailable', statusCode: 503 },
  GEN0004: { code: 'GEN0004', message: 'Unknown error', statusCode: 500 },

  // === VAL: Validation ===
  VAL0001: { code: 'VAL0001', message: 'Invalid input', statusCode: 400 },
  VAL0002: { code: 'VAL0002', message: 'Required field missing', statusCode: 400 },
  VAL0003: { code: 'VAL0003', message: 'Field exceeds maximum length', statusCode: 400 },
  VAL0004: { code: 'VAL0004', message: 'Invalid status transition', statusCode: 400 },

  // === AUT: Authentication ===
  AUT0001: { code: 'AUT0001', message: 'Authentication required', statusCode: 401 },
  AUT0002: { code: 'AUT0002', message: 'Token expired', statusCode: 401 },
  AUT0003: { code: 'AUT0003', message: 'Token invalid', statusCode: 401 },
  AUT0004: { code: 'AUT0004', message: 'Account suspended', statusCode: 403 },
  AUT0005: { code: 'AUT0005', message: 'Account locked', statusCode: 423 },
  AUT0006: { code: 'AUT0006', message: 'Invalid credentials', statusCode: 401 },
  AUT0007: { code: 'AUT0007', message: 'Account not verified', statusCode: 403 },

  // === AUZ: Authorization ===
  AUZ0001: { code: 'AUZ0001', message: 'Access forbidden', statusCode: 403 },
  AUZ0002: { code: 'AUZ0002', message: 'Insufficient permissions', statusCode: 403 },
  AUZ0003: { code: 'AUZ0003', message: 'Role required', statusCode: 403 },

  // === DAT: Database ===
  DAT0001: { code: 'DAT0001', message: 'Resource not found', statusCode: 404 },
  DAT0002: { code: 'DAT0002', message: 'Resource conflict', statusCode: 409 },
  DAT0003: { code: 'DAT0003', message: 'Unique constraint violation', statusCode: 409 },
  DAT0004: { code: 'DAT0004', message: 'Foreign key constraint violation', statusCode: 400 },
  DAT0005: { code: 'DAT0005', message: 'Transaction failed', statusCode: 500 },
  DAT0006: { code: 'DAT0006', message: 'Database connection failed', statusCode: 503 },
  DAT0007: { code: 'DAT0007', message: 'Query failed', statusCode: 500 },

  // === SRV: Server/Infrastructure ===
  SRV0001: { code: 'SRV0001', message: 'Internal server error', statusCode: 500 },
  SRV0002: { code: 'SRV0002', message: 'Queue operation failed', statusCode: 500 },
  SRV0003: { code: 'SRV0003', message: 'Cache operation failed', statusCode: 500 },
} as const;

/** Type for error code keys */
export type ErrorCodeKey = keyof typeof ERROR_CODES;

/** Type for a single error code definition */
export interface ErrorCodeDefinition {
  code: string;
  message: string;
  statusCode: number;
}
