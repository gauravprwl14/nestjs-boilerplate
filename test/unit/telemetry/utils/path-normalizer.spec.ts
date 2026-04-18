import {
  DEFAULT_RULES,
  normalisePath,
  type PathNormalizationRule,
} from '@telemetry/utils/path-normalizer';

describe('normalisePath', () => {
  describe('default rules', () => {
    it('replaces a bare UUID segment with :id', () => {
      // --- ARRANGE ---
      const input = '/api/v1/tweets/550e8400-e29b-41d4-a716-446655440000';

      // --- ACT ---
      const result = normalisePath(input);

      // --- ASSERT ---
      expect(result).toBe('/api/v1/tweets/:id');
    });

    it('is case-insensitive on UUIDs', () => {
      // --- ARRANGE ---
      const input = '/users/550E8400-E29B-41D4-A716-446655440000';

      // --- ACT ---
      const result = normalisePath(input);

      // --- ASSERT ---
      expect(result).toBe('/users/:id');
    });

    it('replaces a numeric id with :id', () => {
      // --- ARRANGE ---
      const input = '/users/42';

      // --- ACT ---
      const result = normalisePath(input);

      // --- ASSERT ---
      expect(result).toBe('/users/:id');
    });

    it('replaces a ULID with :id', () => {
      // --- ARRANGE --- canonical ULID: 26 Crockford-base32 chars
      const input = '/orders/01ARZ3NDEKTSV4RRFFQ69G5FAV';

      // --- ACT ---
      const result = normalisePath(input);

      // --- ASSERT ---
      expect(result).toBe('/orders/:id');
    });

    it('replaces a MongoDB ObjectId with :id', () => {
      // --- ARRANGE --- 24-char hex
      const input = '/docs/507f1f77bcf86cd799439011';

      // --- ACT ---
      const result = normalisePath(input);

      // --- ASSERT ---
      expect(result).toBe('/docs/:id');
    });

    it('replaces a long hex hash with :hash', () => {
      // --- ARRANGE --- 40-char hex (SHA-1-like)
      const input = '/artefacts/da39a3ee5e6b4b0d3255bfef95601890afd80709';

      // --- ACT ---
      const result = normalisePath(input);

      // --- ASSERT ---
      expect(result).toBe('/artefacts/:hash');
    });

    it('leaves static slug segments unchanged', () => {
      // --- ARRANGE ---
      const input = '/api/v1/departments/tree';

      // --- ACT ---
      const result = normalisePath(input);

      // --- ASSERT ---
      expect(result).toBe('/api/v1/departments/tree');
    });

    it('normalises multiple id segments in one path', () => {
      // --- ARRANGE ---
      const input = '/users/abc123/orders/42';

      // --- ACT ---
      const result = normalisePath(input);

      // --- ASSERT --- 'abc123' is not numeric/uuid/ulid/hex-hash so it stays.
      // 42 is numeric so it normalises.
      expect(result).toBe('/users/abc123/orders/:id');
    });

    it('normalises nested ids mixed with slugs', () => {
      // --- ARRANGE ---
      const input =
        '/users/550e8400-e29b-41d4-a716-446655440000/orders/42/items/507f1f77bcf86cd799439011';

      // --- ACT ---
      const result = normalisePath(input);

      // --- ASSERT ---
      expect(result).toBe('/users/:id/orders/:id/items/:id');
    });
  });

  describe('query strings', () => {
    it('preserves the query string verbatim', () => {
      // --- ARRANGE ---
      const input = '/users/42?page=1&sort=desc';

      // --- ACT ---
      const result = normalisePath(input);

      // --- ASSERT ---
      expect(result).toBe('/users/:id?page=1&sort=desc');
    });

    it('preserves an empty query string', () => {
      // --- ARRANGE ---
      const input = '/users/42?';

      // --- ACT ---
      const result = normalisePath(input);

      // --- ASSERT ---
      expect(result).toBe('/users/:id?');
    });
  });

  describe('edge cases', () => {
    it('returns an empty string unchanged', () => {
      expect(normalisePath('')).toBe('');
    });

    it('returns the root path unchanged', () => {
      expect(normalisePath('/')).toBe('/');
    });

    it('preserves a trailing slash', () => {
      // --- ARRANGE ---
      const input = '/users/42/';

      // --- ACT ---
      const result = normalisePath(input);

      // --- ASSERT ---
      expect(result).toBe('/users/:id/');
    });

    it('is idempotent — normalising twice equals normalising once', () => {
      // --- ARRANGE ---
      const input = '/users/42/orders/550e8400-e29b-41d4-a716-446655440000';

      // --- ACT ---
      const once = normalisePath(input);
      const twice = normalisePath(once);

      // --- ASSERT ---
      expect(twice).toBe(once);
      expect(twice).toBe('/users/:id/orders/:id');
    });
  });

  describe('rule precedence', () => {
    it('uuid rule wins over numeric / hash for the same segment', () => {
      // --- ARRANGE --- a UUID would also match the `hash` regex (>=32 hex chars
      // with dashes excluded), but the higher-precedence UUID rule should match
      // first — the placeholder is `:id`, not `:hash`.
      const input = '/x/550e8400-e29b-41d4-a716-446655440000';

      // --- ACT ---
      const result = normalisePath(input);

      // --- ASSERT ---
      expect(result).toBe('/x/:id');
    });

    it('objectid rule wins over hash for 24-char hex', () => {
      // --- ARRANGE --- 24 hex chars matches both objectid AND (technically, no —
      // hash requires 32+). This verifies the 24-char path uses :id.
      const input = '/x/507f1f77bcf86cd799439011';

      // --- ACT ---
      const result = normalisePath(input);

      // --- ASSERT ---
      expect(result).toBe('/x/:id');
    });

    it('honours custom rule lists', () => {
      // --- ARRANGE --- bespoke rule: any segment starting with `tkn_` is a token.
      const customRules: readonly PathNormalizationRule[] = [
        {
          name: 'token',
          pattern: /^tkn_[a-z0-9]+$/i,
          placeholder: ':token',
          precedence: 100,
        },
      ];
      const input = '/refunds/tkn_abc123';

      // --- ACT ---
      const result = normalisePath(input, customRules);

      // --- ASSERT ---
      expect(result).toBe('/refunds/:token');
    });

    it('custom rules can override precedence of defaults by supplying both', () => {
      // --- ARRANGE --- include defaults + a higher-precedence override that
      // maps the numeric segment to a different placeholder.
      const customRules: readonly PathNormalizationRule[] = [
        ...DEFAULT_RULES,
        {
          name: 'numeric-override',
          pattern: /^\d+$/,
          placeholder: ':number',
          precedence: 200,
        },
      ];

      // --- ACT ---
      const result = normalisePath('/users/42', customRules);

      // --- ASSERT ---
      expect(result).toBe('/users/:number');
    });
  });

  describe('performance', () => {
    it('handles 10,000 typical 3-segment paths in under 50 ms', () => {
      // --- ARRANGE ---
      const input = '/users/42/orders/550e8400-e29b-41d4-a716-446655440000';

      // --- ACT ---
      const start = performance.now();
      for (let i = 0; i < 10_000; i++) {
        normalisePath(input);
      }
      const elapsedMs = performance.now() - start;

      // --- ASSERT --- guard against quadratic regressions; 10k runs should
      // be well under 50ms on any developer machine or CI agent.
      expect(elapsedMs).toBeLessThan(50);
    });
  });
});
