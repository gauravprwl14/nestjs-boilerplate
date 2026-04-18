import { ErrorException } from '@errors/types/error-exception';

/**
 * Normalised frame extracted from an error and each nested `cause`.
 * Shape is deliberately library-agnostic so it can feed span events,
 * structured logs, and HTTP response bodies without re-mapping.
 */
export interface SerialisedErrorFrame {
  readonly name: string;
  readonly message: string;
  readonly code?: string;
  readonly stack?: string;
  readonly meta?: Readonly<Record<string, unknown>>;
  readonly statusCode?: number;
}

const DEFAULT_MAX_DEPTH = 10;

/**
 * Walk an error's `cause` chain and return one {@link SerialisedErrorFrame}
 * per level. Guards against cycles, non-Error causes, and depth explosions.
 *
 * @param err Any value caught in a `try/catch`.
 * @param maxDepth Defensive cap on how deep to walk. Defaults to 10.
 * @returns An array of normalised frames, root-most first.
 *
 * @example
 * ```ts
 * try { await svc.run(); }
 * catch (err) {
 *   const frames = serialiseErrorChain(err);
 *   logger.error({ frames }, 'run failed');
 * }
 * ```
 */
export function serialiseErrorChain(
  err: unknown,
  maxDepth: number = DEFAULT_MAX_DEPTH,
): SerialisedErrorFrame[] {
  const frames: SerialisedErrorFrame[] = [];
  const seen = new WeakSet<object>();
  let current: unknown = err;
  let depth = 0;

  while (current != null && depth < maxDepth) {
    if (current instanceof Error) {
      if (seen.has(current)) break;
      seen.add(current);
      frames.push(extractFrame(current));
      current = (current as Error).cause;
    } else {
      frames.push({ name: 'NonErrorCause', message: String(current) });
      break;
    }
    depth++;
  }

  return frames;
}

function extractFrame(err: Error): SerialisedErrorFrame {
  const frame: Writable<SerialisedErrorFrame> = {
    name: err.name ?? 'Error',
    message: err.message ?? '',
    stack: err.stack,
  };
  if (err instanceof ErrorException) {
    frame.code = err.code;
    frame.statusCode = err.statusCode;
  }
  const anyErr = err as unknown as { code?: unknown; meta?: unknown };
  if (frame.code == null && typeof anyErr.code === 'string') {
    frame.code = anyErr.code;
  }
  if (anyErr.meta != null && typeof anyErr.meta === 'object') {
    frame.meta = anyErr.meta as Record<string, unknown>;
  }
  return frame;
}

type Writable<T> = { -readonly [K in keyof T]: T[K] };
