/**
 * Constants consumed by the PII redaction subsystem.
 *
 * Keeping these in a single file lets Pino config, OTel span processors, and
 * the {@link RedactorService} agree on the exact censor string and audit
 * event name without introducing drift.
 */

/** Default censor string used by every redaction path. */
export const REDACTION_CENSOR = '[REDACTED]' as const;

/**
 * Prefix for typed censors (e.g. `[REDACTED:email]`, `[REDACTED:jwt]`).
 * Used by the free-form string scrubber so downstream consumers can tell
 * which PII category was masked.
 */
export const REDACTION_CENSOR_PREFIX = '[REDACTED:' as const;

/**
 * Span/log event emitted whenever a caller opts into unmasking a PII path
 * via `RedactOptions.allow`. Security audit dashboards key off this name.
 */
export const ALLOW_PII_USED_EVENT = 'security.allow_pii.used' as const;

/**
 * Strings longer than this are truncated before regex scrubbing to cap the
 * worst-case cost of `String.prototype.replace` against pathological inputs.
 */
export const REDACTION_MAX_STRING_LENGTH = 16_384;
