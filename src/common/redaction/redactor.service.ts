import { Injectable } from '@nestjs/common';
import fastRedact from 'fast-redact';

import { DEFAULT_PII_PATHS } from './pii-registry';
import { REDACTION_CENSOR, REDACTION_MAX_STRING_LENGTH } from './redaction.constants';
import { PII_STRING_PATTERNS } from './string-patterns';

/** Options accepted by every public redaction method. */
export interface RedactOptions {
  /**
   * Paths from the registry to leave **unmasked** for this single call.
   * Use sparingly — always audit via `shouldAuditAllowPII`.
   */
  readonly allow?: readonly string[];
}

/** OTel-style flat attribute dictionary shape (`{ 'a.b.c': v }`). */
type FlatAttributes = Record<string, unknown>;

/**
 * Concrete type returned by `fastRedact` when called with `serialize: false`.
 * `fast-redact` ships two overloads; we only use the non-serialising one so
 * this narrower type keeps TypeScript honest at the call site.
 */
type FastRedactFn = ReturnType<typeof fastRedact>;

/** Depth cap for the recursive leaf-key walker. */
const MAX_WALK_DEPTH = 12;

/**
 * Sensitive leaf-key names extracted from {@link DEFAULT_PII_PATHS}.
 *
 * `fast-redact`'s `*` wildcard only crosses a single level, so a path like
 * `*.password` catches `<root>.password` but NOT `a.b.c.d.password` or
 * `users[0].ssn`. To keep "registry is the only list" honest without
 * paying the cost of also enumerating every conceivable depth, we derive
 * the sensitive leaf names from the registry once and use them as a
 * safety-net walker after fast-redact runs.
 */
const SENSITIVE_LEAF_KEYS: ReadonlySet<string> = new Set(
  DEFAULT_PII_PATHS.map(extractLeafKey).filter((k): k is string => k !== null),
);

/**
 * Pull the final key name out of a fast-redact path, stripping bracket quoting.
 * Returns `null` for paths whose leaf is a wildcard (`*` or `[*]`) since those
 * give no usable leaf-name signal.
 *
 * @example
 *   `*.password`                -> `password`
 *   `req.headers.authorization` -> `authorization`
 *   `req.headers["x-api-key"]`  -> `x-api-key`
 *   `users[*]`                  -> null
 */
function extractLeafKey(path: string): string | null {
  const bracketMatch = path.match(/\[['"]?([^'"\]]+)['"]?\]\s*$/);
  if (bracketMatch) {
    const inner = bracketMatch[1];
    return inner === '*' ? null : inner;
  }
  const lastDot = path.lastIndexOf('.');
  const leaf = lastDot >= 0 ? path.slice(lastDot + 1) : path;
  if (leaf === '*' || leaf === '') return null;
  return leaf;
}

/**
 * Extract the leaf segment of an OTel-flat attribute key.
 * `method.args.user.password` -> `password`, `ssn` -> `ssn`.
 */
function leafOfFlatKey(flatKey: string): string {
  const lastDot = flatKey.lastIndexOf('.');
  return lastDot >= 0 ? flatKey.slice(lastDot + 1) : flatKey;
}

/**
 * Turn an `allow` list (registry paths) into a set of leaf key names so the
 * flat-attribute redactor can short-circuit on opt-ins.
 */
function buildAllowedLeafSet(allow?: readonly string[]): ReadonlySet<string> {
  if (!allow || allow.length === 0) return new Set();
  return new Set(allow.map(extractLeafKey).filter((k): k is string => k !== null));
}

/**
 * Wrapper around `fast-redact` that:
 * - sources its paths from {@link DEFAULT_PII_PATHS} so there is one and only
 *   one PII list in the codebase;
 * - supports both nested and OTel-flat attribute shapes; and
 * - exposes a regex scrubber for free-form strings.
 *
 * ## Usage notes
 *
 * 1. `fast-redact` mutates the input object in place — we return the same
 *    reference for convenience. Do not pass objects that are concurrently
 *    read from another thread/context. Clone first if you need isolation.
 * 2. After `fast-redact` runs we do a bounded depth-first walk to catch
 *    sensitive leaf names that sat beyond a single `*` hop (the library's
 *    wildcards don't span multiple levels). This keeps the registry the
 *    sole source of truth without also forcing us to enumerate every
 *    possible depth as a fast-redact path.
 * 3. `.restore()` (attached by fast-redact to its redactor function) is
 *    intentionally **not** called — redaction is meant to stick for
 *    logging paths.
 *
 * @see https://github.com/davidmarkclements/fast-redact
 */
@Injectable()
export class RedactorService {
  /** Pre-built redactor for the common (no-allow-list) fast path. */
  private readonly defaultRedactor: FastRedactFn;

  constructor() {
    this.defaultRedactor = fastRedact({
      paths: [...DEFAULT_PII_PATHS],
      censor: REDACTION_CENSOR,
      serialize: false,
      strict: false,
    });
  }

  /**
   * Redact PII from a nested object. Mutates the input and returns the same
   * reference. Primitives and `null`/`undefined` are returned unchanged.
   */
  redactObject<T>(input: T, opts: RedactOptions = {}): T {
    if (input == null || typeof input !== 'object') return input;
    const redactor = this.pickRedactor(opts.allow);
    try {
      redactor(input as unknown as object);
    } catch {
      // fast-redact in non-strict mode tolerates most inputs; swallow
      // anything unusual rather than nuking a log line.
    }
    const allowedLeaves = buildAllowedLeafSet(opts.allow);
    walkAndCensorLeafKeys(input, allowedLeaves);
    return input;
  }

  /**
   * Redact an OTel-style flat attribute dictionary. Keys like
   * `method.args.user.password` can be arbitrarily deep — deeper than
   * `fast-redact`'s single-level `*` wildcard can reach — so we match the
   * *leaf segment* of each flat key against {@link SENSITIVE_LEAF_KEYS}
   * (derived from the registry) instead of round-tripping through the nested
   * redactor.
   *
   * @param opts.allow - Registry paths whose leaf key should be left unmasked
   *   for this single call. Example: `['*.email']` → the `email` leaf is kept
   *   in cleartext.
   */
  redactFlatAttributes(attrs: FlatAttributes, opts: RedactOptions = {}): FlatAttributes {
    if (!attrs || typeof attrs !== 'object') return attrs;

    const allowedLeaves = buildAllowedLeafSet(opts.allow);
    const out: FlatAttributes = {};
    for (const [flatKey, value] of Object.entries(attrs)) {
      const leaf = leafOfFlatKey(flatKey);
      if (SENSITIVE_LEAF_KEYS.has(leaf) && !allowedLeaves.has(leaf)) {
        out[flatKey] = REDACTION_CENSOR;
      } else {
        out[flatKey] = value;
      }
    }
    return out;
  }

  /**
   * Scrub PII (emails, phones, SSN, JWT, credit cards) from free-form
   * strings — exception messages, stack traces, HTTP body samples.
   *
   * Non-string inputs are returned untouched so call sites don't need to
   * null-check. Oversized strings are truncated before scrubbing to cap
   * worst-case regex cost.
   */
  redactString(input: string): string {
    if (typeof input !== 'string' || input.length === 0) return input;

    const slice =
      input.length > REDACTION_MAX_STRING_LENGTH
        ? `${input.slice(0, REDACTION_MAX_STRING_LENGTH)}…[truncated]`
        : input;

    let out = slice;
    for (const p of PII_STRING_PATTERNS) {
      out = out.replace(p.pattern, p.replacement);
    }
    return out;
  }

  /**
   * Build (or reuse) a redactor for the given allow-list. The default
   * redactor is shared across calls when no allow-list is passed; otherwise
   * a per-call redactor is constructed from the subset of paths.
   */
  private pickRedactor(allow?: readonly string[]): FastRedactFn {
    if (!allow || allow.length === 0) return this.defaultRedactor;
    const filtered = DEFAULT_PII_PATHS.filter(p => !allow.includes(p));
    return fastRedact({
      paths: [...filtered],
      censor: REDACTION_CENSOR,
      serialize: false,
      strict: false,
    });
  }
}

/**
 * Bounded depth-first walker that censors any property whose name matches
 * {@link SENSITIVE_LEAF_KEYS} (minus anything in `allowedLeaves`). Tracks
 * visited objects in a WeakSet so circular references are safe. Capped at
 * {@link MAX_WALK_DEPTH} to prevent runaway cost on pathological inputs.
 */
function walkAndCensorLeafKeys(root: unknown, allowedLeaves: ReadonlySet<string>): void {
  const seen = new WeakSet<object>();
  const visit = (node: unknown, depth: number): void => {
    if (depth > MAX_WALK_DEPTH) return;
    if (node === null || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    if (seen.has(obj)) return;
    seen.add(obj);

    if (Array.isArray(obj)) {
      for (const item of obj) visit(item, depth + 1);
      return;
    }

    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (SENSITIVE_LEAF_KEYS.has(key) && !allowedLeaves.has(key) && val !== REDACTION_CENSOR) {
        obj[key] = REDACTION_CENSOR;
        continue;
      }
      if (val !== null && typeof val === 'object') visit(val, depth + 1);
    }
  };
  visit(root, 0);
}
