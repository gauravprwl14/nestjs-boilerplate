import { GENERAL_ERRORS } from './general.errors';
import { VALIDATION_ERRORS } from './validation.errors';
import { AUTH_ERRORS } from './auth.errors';
import { AUTHORIZATION_ERRORS } from './authorization.errors';
import { DATABASE_ERRORS } from './database.errors';
import { SERVER_ERRORS } from './server.errors';
import { ErrorCodeDefinition } from '../interfaces/error.interfaces';

export { GENERAL_ERRORS } from './general.errors';
export { VALIDATION_ERRORS } from './validation.errors';
export { AUTH_ERRORS } from './auth.errors';
export { AUTHORIZATION_ERRORS } from './authorization.errors';
export { DATABASE_ERRORS } from './database.errors';
export { SERVER_ERRORS } from './server.errors';

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
  GEN: GENERAL_ERRORS,
  /** Validation errors (VAL prefix) */
  VAL: VALIDATION_ERRORS,
  /** Authentication errors (AUT prefix) */
  AUT: AUTH_ERRORS,
  /** Authorization errors (AUZ prefix) */
  AUZ: AUTHORIZATION_ERRORS,
  /** Database errors (DAT prefix) */
  DAT: DATABASE_ERRORS,
  /** Server / infrastructure errors (SRV prefix) */
  SRV: SERVER_ERRORS,
} as const;

/**
 * Union type of all valid dot-notation error keys, e.g. 'VAL.INVALID_INPUT'.
 * Use with {@link getErrorDefinition} for type-safe error lookups.
 */
export type ErrorCodeKey =
  | `GEN.${keyof typeof GENERAL_ERRORS}`
  | `VAL.${keyof typeof VALIDATION_ERRORS}`
  | `AUT.${keyof typeof AUTH_ERRORS}`
  | `AUZ.${keyof typeof AUTHORIZATION_ERRORS}`
  | `DAT.${keyof typeof DATABASE_ERRORS}`
  | `SRV.${keyof typeof SERVER_ERRORS}`;

/**
 * Resolve an {@link ErrorCodeDefinition} from a dot-notation key.
 *
 * @param key - Dot-notation key such as `'VAL.INVALID_INPUT'` or `'DAT.NOT_FOUND'`
 * @returns The matching ErrorCodeDefinition
 *
 * @example
 * ```typescript
 * const def = getErrorDefinition('DAT.NOT_FOUND');
 * ```
 */
export function getErrorDefinition(key: ErrorCodeKey): ErrorCodeDefinition {
  const [domain, errorKey] = key.split('.') as [string, string];
  return (ERROR_CODES as Record<string, Record<string, ErrorCodeDefinition>>)[domain][errorKey];
}
