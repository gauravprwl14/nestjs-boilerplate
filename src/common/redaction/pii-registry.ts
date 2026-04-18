/**
 * Single source of truth for every PII-bearing path in the application.
 *
 * Pino redaction, OTel span-attribute redaction, and the {@link RedactorService}
 * all read from {@link DEFAULT_PII_PATHS}, so adding a new sensitive field
 * means editing exactly one list here.
 *
 * **Path syntax** (fast-redact 3.5 compatible):
 * - Dotted paths: `a.b.c`
 * - Single-level wildcard: `*` (one key level — NOT `**`)
 * - Array index wildcard: `[*]`
 * - Bracketed string keys: `["x-api-key"]`
 *
 * @see https://github.com/davidmarkclements/fast-redact
 */

export const PII_CATEGORIES = {
  CREDENTIALS: 'credentials',
  IDENTIFIERS: 'identifiers',
  CONTACT: 'contact',
  FINANCIAL: 'financial',
  DEVICE: 'device',
} as const;

export type PIICategory = (typeof PII_CATEGORIES)[keyof typeof PII_CATEGORIES];

/**
 * A group of related PII paths. Groups exist only to give the registry a
 * human-readable structure; the redactor flattens them into a single list
 * via {@link DEFAULT_PII_PATHS}.
 */
export interface PIIPathGroup {
  readonly category: PIICategory;
  readonly severity: 'high' | 'medium';
  readonly description: string;
  readonly paths: readonly string[];
}

/**
 * Every PII-bearing path known to the application, grouped by category.
 *
 * When adding a path, keep it at the broadest useful scope (e.g. `*.password`
 * rather than `user.password`) so the same rule catches the field regardless
 * of the enclosing object shape.
 */
export const PII_PATH_GROUPS: Readonly<Record<string, PIIPathGroup>> = {
  credentials: {
    category: PII_CATEGORIES.CREDENTIALS,
    severity: 'high',
    description: 'Passwords, hashes, secrets, tokens, API keys, auth headers',
    paths: [
      '*.password',
      '*.passwordHash',
      '*.passwordConfirmation',
      '*.currentPassword',
      '*.newPassword',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
      '*.ssoToken',
      '*.idToken',
      '*.apiKey',
      '*.apiSecret',
      '*.secret',
      '*.clientSecret',
      '*.privateKey',
      'req.headers.authorization',
      'req.headers["authorization"]',
      'req.headers.cookie',
      'req.headers["cookie"]',
      'req.headers["x-api-key"]',
      'req.headers["x-auth-token"]',
      'res.headers["set-cookie"]',
      '*.headers.authorization',
      '*.headers.cookie',
      // Downstream-trust / proxy auth headers. These commonly carry bearer
      // tokens, forwarded identity JWTs, or session material set by a
      // reverse proxy (ALB/CloudFront/IAP/...); they must never land in
      // telemetry in cleartext. See WP2-9 of plan-2.
      'req.headers["proxy-authorization"]',
      'req.headers["x-forwarded-authorization"]',
      'req.headers["x-forwarded-user"]',
      'req.headers["x-amzn-oidc-data"]',
      'req.headers["x-amzn-oidc-accesstoken"]',
      'req.headers["x-amzn-oidc-identity"]',
      'req.headers["x-csrf-token"]',
      'req.headers["x-xsrf-token"]',
      'req.headers["x-session-id"]',
      'req.headers["x-goog-iap-jwt-assertion"]',
      // Wildcard nested forms catch the same headers when the enclosing
      // object is not `req` (e.g. nested on `*.req`, on an outbound
      // request shape, or on a sub-request object).
      '*.headers["proxy-authorization"]',
      '*.headers["x-forwarded-authorization"]',
      '*.headers["x-forwarded-user"]',
      '*.headers["x-amzn-oidc-data"]',
      '*.headers["x-amzn-oidc-accesstoken"]',
      '*.headers["x-amzn-oidc-identity"]',
      '*.headers["x-csrf-token"]',
      '*.headers["x-xsrf-token"]',
      '*.headers["x-session-id"]',
      '*.headers["x-goog-iap-jwt-assertion"]',
    ],
  },
  identifiers: {
    category: PII_CATEGORIES.IDENTIFIERS,
    severity: 'high',
    description: 'Government and biometric identifiers',
    paths: [
      '*.ssn',
      '*.socialSecurityNumber',
      '*.nationalId',
      '*.passportNumber',
      '*.driverLicense',
      '*.taxId',
    ],
  },
  contact: {
    category: PII_CATEGORIES.CONTACT,
    severity: 'medium',
    description: 'Email, phone, address, and similar contact fields',
    paths: [
      '*.email',
      '*.emailAddress',
      '*.phone',
      '*.phoneNumber',
      '*.mobile',
      '*.address',
      '*.streetAddress',
      '*.city',
      '*.postalCode',
      '*.zip',
    ],
  },
  financial: {
    category: PII_CATEGORIES.FINANCIAL,
    severity: 'high',
    description: 'Payment instruments and bank details',
    paths: [
      '*.cardNumber',
      '*.cvv',
      '*.cvc',
      '*.pan',
      '*.iban',
      '*.accountNumber',
      '*.routingNumber',
    ],
  },
  device: {
    category: PII_CATEGORIES.DEVICE,
    severity: 'medium',
    description: 'Device and network identifiers',
    paths: ['*.deviceId', '*.macAddress', '*.ipAddress'],
  },
};

/**
 * Flat, deduplicated, frozen list of every PII path in {@link PII_PATH_GROUPS}.
 *
 * This is the list that gets handed to `fast-redact` and Pino. It is frozen so
 * accidental mutation at runtime fails loudly.
 */
export const DEFAULT_PII_PATHS: readonly string[] = Object.freeze(
  Object.values(PII_PATH_GROUPS).flatMap(g => g.paths),
);
