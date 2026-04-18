/**
 * Rule-based path normalisation for cardinality-safe HTTP span / metric names.
 *
 * The Tempo UI groups spans by `http.route` (and the Nest-resolved route
 * pattern is what we want there); metrics derived from those spans explode in
 * cardinality whenever a raw id leaks into the route. When the Nest router
 * has NOT resolved a pattern (for example because a middleware threw before
 * the router ran), we fall back to this utility to turn
 * `/api/v1/tweets/abc-123-def` into `/api/v1/tweets/:id` so the string is
 * safe to use as a metric / span-name dimension.
 *
 * The implementation is deliberately simple: a first-match-wins, ordered
 * list of regex rules. Per-host rule groups (e.g. different rules for
 * `stripe.com` vs. `internal-api`) are intentionally out of scope — revisit
 * when / if we have more than three external hosts to worry about.
 *
 * @module telemetry/utils/path-normalizer
 */

/**
 * A single normalisation rule.
 *
 * Rules are evaluated per path segment in precedence order (highest first).
 * The first rule whose `pattern` matches the segment wins; its `placeholder`
 * replaces the segment in the normalised output.
 */
export interface PathNormalizationRule {
  /** Stable human-readable name — surfaces in logs when debugging rules. */
  readonly name: string;
  /** Regex to match against a single path segment (no slashes). */
  readonly pattern: RegExp;
  /** Value inserted into the normalised path when `pattern` matches. */
  readonly placeholder: string;
  /** Higher runs first. Ties resolve in declaration order. */
  readonly precedence: number;
  /**
   * Optional extra guard. When present, the rule only matches if this
   * returns `true` for the segment and its surrounding context. Useful for
   * rules that need to look at neighbouring segments (e.g. "numeric only
   * after `/users`").
   */
  readonly contextCheck?: (segment: string, segments: readonly string[], index: number) => boolean;
}

/**
 * Default rule set — ordered by precedence (highest first).
 *
 * Intentionally conservative: each rule matches only values that are
 * extremely unlikely to be a human-readable slug. Rule precedence matters
 * for ambiguous inputs (e.g. a 32-char hex string matches both `objectid`
 * and `hash`; the higher-precedence `objectid` rule wins).
 */
export const DEFAULT_RULES: readonly PathNormalizationRule[] = [
  {
    name: 'uuid',
    pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    placeholder: ':id',
    precedence: 100,
  },
  {
    name: 'ulid',
    // Crockford's base32: 26 chars, no I/L/O/U
    pattern: /^[0-9A-HJKMNP-TV-Z]{26}$/,
    placeholder: ':id',
    precedence: 95,
  },
  {
    name: 'objectid',
    // MongoDB ObjectId — exactly 24 hex chars
    pattern: /^[0-9a-f]{24}$/i,
    placeholder: ':id',
    precedence: 90,
  },
  {
    name: 'numeric',
    pattern: /^\d+$/,
    placeholder: ':id',
    precedence: 80,
  },
  {
    name: 'hash',
    // 32+-char hex string (sha256 fingerprint / 40-char sha1 etc.)
    pattern: /^[0-9a-f]{32,}$/i,
    placeholder: ':hash',
    precedence: 70,
  },
];

/**
 * Applies a sorted-by-precedence rule list to a single path segment. Returns
 * the placeholder for the first matching rule, or the segment unchanged when
 * no rule matches.
 */
function normaliseSegment(
  segment: string,
  sortedRules: readonly PathNormalizationRule[],
  allSegments: readonly string[],
  index: number,
): string {
  for (const rule of sortedRules) {
    if (!rule.pattern.test(segment)) continue;
    if (rule.contextCheck && !rule.contextCheck(segment, allSegments, index)) continue;
    return rule.placeholder;
  }
  return segment;
}

/**
 * Normalises a URL path for use as a cardinality-safe label.
 *
 * Steps:
 * 1. Split query string off (preserved verbatim — query normalisation is
 *    out of scope for this util; redactors handle sensitive keys at the
 *    attribute-set boundary).
 * 2. Preserve a trailing slash if present.
 * 3. Split on `/`, normalise each non-empty segment against the rule set.
 * 4. Rejoin; re-append the query string.
 *
 * The empty string and `"/"` are returned unchanged.
 *
 * @example
 * normalisePath('/api/v1/tweets/550e8400-e29b-41d4-a716-446655440000')
 * // → '/api/v1/tweets/:id'
 *
 * @example
 * normalisePath('/users/42/orders/99?page=1')
 * // → '/users/:id/orders/:id?page=1'
 */
export function normalisePath(
  path: string,
  rules: readonly PathNormalizationRule[] = DEFAULT_RULES,
): string {
  if (path === '' || path === '/') return path;

  const queryIdx = path.indexOf('?');
  const pathPart = queryIdx === -1 ? path : path.slice(0, queryIdx);
  const queryPart = queryIdx === -1 ? '' : path.slice(queryIdx); // includes leading '?'

  const hasTrailingSlash = pathPart.length > 1 && pathPart.endsWith('/');
  const trimmedPath = hasTrailingSlash ? pathPart.slice(0, -1) : pathPart;

  // Sort rules once per call — rule lists are small and this is not hot
  // enough to justify a cache.
  const sortedRules = [...rules].sort((a, b) => b.precedence - a.precedence);

  const segments = trimmedPath.split('/');
  const normalisedSegments = segments.map((segment, index) => {
    if (segment === '') return segment; // preserve leading empty (first char was '/')
    return normaliseSegment(segment, sortedRules, segments, index);
  });

  const normalisedPath = normalisedSegments.join('/') + (hasTrailingSlash ? '/' : '');
  return normalisedPath + queryPart;
}
