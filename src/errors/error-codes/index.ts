export { GEN } from './general.errors';
export { VAL } from './validation.errors';
export { AUT } from './auth.errors';
export { AUZ } from './authorization.errors';
export { DAT } from './database.errors';
export { SRV } from './server.errors';

import { GEN } from './general.errors';
import { VAL } from './validation.errors';
import { AUT } from './auth.errors';
import { AUZ } from './authorization.errors';
import { DAT } from './database.errors';
import { SRV } from './server.errors';

/**
 * Central registry of all application error codes, grouped by domain.
 *
 * Usage:
 * ```typescript
 * ERROR_CODES.VAL.INVALID_INPUT
 * ERROR_CODES.DAT.NOT_FOUND
 * ```
 */
export const ERROR_CODES = {
  /** General / infrastructure errors (GEN prefix) */
  GEN,
  /** Validation errors (VAL prefix) */
  VAL,
  /** Authentication errors (AUT prefix) */
  AUT,
  /** Authorization errors (AUZ prefix) */
  AUZ,
  /** Database errors (DAT prefix) */
  DAT,
  /** Server / infrastructure errors (SRV prefix) */
  SRV,
} as const;
