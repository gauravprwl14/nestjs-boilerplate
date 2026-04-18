/**
 * Rate-limits the `security.allow_pii.used` audit event so a hot path that
 * unmasks PII every request does not flood the log pipeline.
 *
 * The pairing of `path` (what was allowed) and `callsite` (where the escape
 * lives in the source) is treated as the audit key. The first time a key is
 * seen we return `true`; subsequent calls return `false`.
 */

/**
 * Hard cap on the audit set. A runaway caller minting unique keys should not
 * be able to exhaust process memory — once we hit this we stop tracking new
 * keys (effectively suppressing further audits) rather than evict existing
 * ones.
 */
const AUDIT_LOG_KEY_CAP = 10_000;

/** Module-local Set of `${path}@${callsite}` strings that have been audited. */
const audited = new Set<string>();

/**
 * @returns `true` if `(path, callsite)` has not been seen before in this
 * process; `false` otherwise (or when the audit cap is reached).
 *
 * @example
 * ```ts
 * if (shouldAuditAllowPII('*.email', 'users.controller.ts:42')) {
 *   logger.logEvent('security.allow_pii.used', { attributes: { path: '*.email' } });
 * }
 * ```
 */
export function shouldAuditAllowPII(path: string, callsite: string): boolean {
  if (audited.size >= AUDIT_LOG_KEY_CAP) return false;
  const key = `${path}@${callsite}`;
  if (audited.has(key)) return false;
  audited.add(key);
  return true;
}

/**
 * Test-only reset hook. Exported with the `__` prefix so production callers
 * are unlikely to import it by accident.
 *
 * @internal
 */
export function __resetAllowPIIAudit(): void {
  audited.clear();
}
