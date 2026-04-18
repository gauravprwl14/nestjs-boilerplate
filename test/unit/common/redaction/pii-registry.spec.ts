import { DEFAULT_PII_PATHS, PII_CATEGORIES, PII_PATH_GROUPS } from '@common/redaction/pii-registry';
import { REDACTION_CENSOR } from '@common/redaction/redaction.constants';
import { RedactorService } from '@common/redaction/redactor.service';

/**
 * Auth-adjacent headers added in WP2-9 of plan-2. Each one is either a
 * downstream-trust JWT (AWS ALB / Google IAP), a forwarded identity header,
 * a CSRF / session token, or a proxy bearer. They all belong in the
 * `credentials` group.
 */
const WP2_9_NEW_HEADERS: readonly string[] = [
  'proxy-authorization',
  'x-forwarded-authorization',
  'x-forwarded-user',
  'x-amzn-oidc-data',
  'x-amzn-oidc-accesstoken',
  'x-amzn-oidc-identity',
  'x-csrf-token',
  'x-xsrf-token',
  'x-session-id',
  'x-goog-iap-jwt-assertion',
];

describe('PII registry', () => {
  it('exposes at least one credential and one identifier path', () => {
    // Arrange + Act: import-time constants
    // Assert
    expect(DEFAULT_PII_PATHS).toEqual(expect.arrayContaining(['*.password', '*.ssn']));
  });

  it('has no duplicate paths', () => {
    // Arrange + Act
    const dupes = DEFAULT_PII_PATHS.filter((p, i, arr) => arr.indexOf(p) !== i);

    // Assert
    expect(dupes).toEqual([]);
  });

  it('every group declares a category, severity, and at least one path', () => {
    // Arrange
    const validCategories = new Set(Object.values(PII_CATEGORIES));

    // Act + Assert
    for (const group of Object.values(PII_PATH_GROUPS)) {
      expect(group.category).toBeDefined();
      expect(validCategories.has(group.category)).toBe(true);
      expect(['high', 'medium']).toContain(group.severity);
      expect(group.paths.length).toBeGreaterThan(0);
      expect(typeof group.description).toBe('string');
    }
  });

  it('DEFAULT_PII_PATHS is frozen to prevent runtime mutation', () => {
    // Arrange + Act + Assert
    expect(Object.isFrozen(DEFAULT_PII_PATHS)).toBe(true);
  });

  describe('auth-adjacent header paths (WP2-9)', () => {
    it.each(WP2_9_NEW_HEADERS)(
      'registers req.headers["%s"] and *.headers["%s"] under credentials',
      header => {
        // Arrange
        const reqPath = `req.headers["${header}"]`;
        const wildcardPath = `*.headers["${header}"]`;

        // Assert — both the req-scoped and wildcard-scoped forms are present
        expect(DEFAULT_PII_PATHS).toContain(reqPath);
        expect(DEFAULT_PII_PATHS).toContain(wildcardPath);

        // And specifically under the credentials group (not a new group)
        const credPaths = PII_PATH_GROUPS.credentials.paths;
        expect(credPaths).toContain(reqPath);
        expect(credPaths).toContain(wildcardPath);
      },
    );
  });

  describe('RedactorService integration for auth-adjacent headers', () => {
    let redactor: RedactorService;

    beforeEach(() => {
      // Arrange — fresh instance so fast-redact's internal closure stays clean
      redactor = new RedactorService();
    });

    it.each(WP2_9_NEW_HEADERS)(
      'redacts req.headers["%s"] when present on a request-like object',
      header => {
        // Arrange — mimic the Express `req` shape that the Pino HTTP serialiser
        // produces. fast-redact needs the enclosing object to be called `req`
        // for the `req.headers[...]` rule to match, or we rely on the wildcard
        // `*.headers[...]` fallback otherwise.
        const input = {
          req: {
            headers: {
              [header]: 'Bearer super-secret-token-value',
              // Include a benign header to prove we only redact the target.
              'x-request-id': 'req-123',
            },
          },
        };

        // Act
        const out = redactor.redactObject(input) as typeof input;

        // Assert
        expect(out.req.headers[header]).toBe(REDACTION_CENSOR);
        expect(out.req.headers['x-request-id']).toBe('req-123');
      },
    );

    it('redacts every WP2-9 header at once on a compound request object', () => {
      // Arrange — all new headers set simultaneously.
      const headers: Record<string, string> = Object.fromEntries(
        WP2_9_NEW_HEADERS.map(h => [h, 'leaked-secret']),
      );
      headers['content-type'] = 'application/json';
      const input = { req: { headers } };

      // Act
      const out = redactor.redactObject(input) as typeof input;

      // Assert — every auth-adjacent header is censored; content-type remains.
      for (const header of WP2_9_NEW_HEADERS) {
        expect(out.req.headers[header]).toBe(REDACTION_CENSOR);
      }
      expect(out.req.headers['content-type']).toBe('application/json');
    });
  });
});
