import { REDACTION_CENSOR_PREFIX } from './redaction.constants';

/**
 * Regex-driven scrubbing rule applied to free-form strings (exception
 * messages, stack traces, HTTP body samples) where structured path-based
 * redaction cannot reach.
 */
export interface PIIStringPattern {
  readonly name: string;
  readonly pattern: RegExp;
  readonly replacement: string;
}

/**
 * Ordered list of string patterns applied left-to-right by
 * {@link RedactorService.redactString}. **Order matters**:
 *
 * 1. `jwt` — highly specific `eyJ…` shape, earliest so we don't accidentally
 *    truncate the header when a later rule matches a substring.
 * 2. `bearer_token` — captures the scheme and only censors the opaque tail.
 * 3. `email` — conservative RFC-ish shape that rejects `12345` (see test).
 * 4. `ssn` — strict `nnn-nn-nnnn` before the greedy credit-card pattern.
 * 5. `credit_card` — 13–19 digit runs, must run *before* phone because the
 *    phone regex can match partial card substrings.
 * 6. `phone_e164` — last, to avoid swallowing card digits.
 */
export const PII_STRING_PATTERNS: readonly PIIStringPattern[] = Object.freeze([
  {
    name: 'jwt',
    pattern: /\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g,
    replacement: `${REDACTION_CENSOR_PREFIX}jwt]`,
  },
  {
    name: 'bearer_token',
    pattern: /\b(Bearer|Basic)\s+[A-Za-z0-9+/=._-]+/gi,
    replacement: `$1 ${REDACTION_CENSOR_PREFIX}token]`,
  },
  {
    name: 'email',
    pattern: /\b[\w.!#$%&'*+/=?^_`{|}~-]+@[\w-]+(?:\.[\w-]+)+\b/g,
    replacement: `${REDACTION_CENSOR_PREFIX}email]`,
  },
  {
    name: 'ssn',
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: `${REDACTION_CENSOR_PREFIX}ssn]`,
  },
  {
    name: 'credit_card',
    pattern: /\b(?:\d[ -]?){13,19}\b/g,
    replacement: `${REDACTION_CENSOR_PREFIX}card]`,
  },
  {
    name: 'phone_e164',
    pattern: /\b\+?\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/g,
    replacement: `${REDACTION_CENSOR_PREFIX}phone]`,
  },
]);
