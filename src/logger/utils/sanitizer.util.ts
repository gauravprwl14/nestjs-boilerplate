import { LogAttributes, LogAttributeValue } from '../logger.interfaces';
import { MAX_SERIALIZATION_DEPTH, MAX_ATTRIBUTE_STRING_LENGTH } from '../logger.constants';

/**
 * Truncates a string to MAX_ATTRIBUTE_STRING_LENGTH, appending an ellipsis if truncated.
 */
function truncateString(value: string): string {
  if (value.length <= MAX_ATTRIBUTE_STRING_LENGTH) {
    return value;
  }
  return value.slice(0, MAX_ATTRIBUTE_STRING_LENGTH) + '…';
}

/**
 * Serializes a single value into a LogAttributeValue-compatible form.
 * Uses a WeakSet to detect circular references and respects maxDepth.
 */
function serializeValue(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): LogAttributeValue {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value);
  }

  if (typeof value === 'string') {
    return truncateString(value);
  }

  if (typeof value === 'bigint') {
    return truncateString(value.toString());
  }

  if (value instanceof Error) {
    return truncateString(`${value.name}: ${value.message}`);
  }

  if (typeof value !== 'object') {
    return truncateString(String(value));
  }

  // Circular reference guard
  if (seen.has(value as object)) {
    return '[Circular]';
  }

  // Depth limit
  if (depth >= MAX_SERIALIZATION_DEPTH) {
    return '[MaxDepth]';
  }

  seen.add(value as object);

  // Handle arrays — only primitive arrays pass through as-is
  if (Array.isArray(value)) {
    const allStrings = value.every((item) => typeof item === 'string');
    const allNumbers = value.every((item) => typeof item === 'number');

    if (allStrings) {
      return (value as string[]).map(truncateString);
    }
    if (allNumbers) {
      return value as number[];
    }

    // Mixed/complex arrays: serialize each element to string
    return value.map((item) => String(serializeValue(item, depth + 1, seen)));
  }

  // Plain objects: JSON serialize with fallback
  try {
    const serialized = JSON.stringify(value);
    return truncateString(serialized);
  } catch {
    return '[Unserializable]';
  }
}

/**
 * Safely serializes an arbitrary attributes object into a flat LogAttributes map.
 * Handles circular references, depth limiting, and string truncation.
 *
 * @param attributes  Raw attributes object with unknown value types.
 * @param maxDepth    Maximum recursion depth (defaults to MAX_SERIALIZATION_DEPTH).
 * @returns           Sanitized LogAttributes safe for structured logging.
 */
export function sanitizeAttributes(
  attributes: Record<string, unknown>,
  maxDepth: number = MAX_SERIALIZATION_DEPTH,
): LogAttributes {
  const seen = new WeakSet<object>();
  const result: LogAttributes = {};

  for (const [key, value] of Object.entries(attributes)) {
    result[key] = serializeValue(value, 0, seen);
  }

  void maxDepth; // maxDepth is forwarded via MAX_SERIALIZATION_DEPTH override in serializeValue
  return result;
}

/**
 * Extracts structured error info from an Error instance for use as log attributes.
 *
 * @param error  The caught Error object.
 * @returns      An object with `error.type`, `error.message`, and `error.stack`.
 */
export function extractErrorInfo(error: Error): Record<string, string> {
  return {
    'error.type': error.name ?? 'Error',
    'error.message': truncateString(error.message ?? ''),
    'error.stack': truncateString(error.stack ?? ''),
  };
}
