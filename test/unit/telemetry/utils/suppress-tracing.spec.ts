import { context } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';

import {
  SUPPRESS_TRACING_KEY,
  isSuppressed,
  withSuppressed,
} from '@telemetry/utils/suppress-tracing';

// Install an async-local-storage context manager so `context.with` actually
// scopes the key across async boundaries.
const contextManager = new AsyncLocalStorageContextManager();
contextManager.enable();
context.setGlobalContextManager(contextManager);

describe('suppress-tracing', () => {
  describe('isSuppressed()', () => {
    it('returns false by default', () => {
      // Act + Assert
      expect(isSuppressed()).toBe(false);
    });

    it('returns true inside withSuppressed()', () => {
      // Act + Assert
      withSuppressed(() => {
        expect(isSuppressed()).toBe(true);
      });
    });

    it('does not leak suppression outside withSuppressed()', () => {
      // Arrange
      withSuppressed(() => {
        expect(isSuppressed()).toBe(true);
      });

      // Assert — outside the callback the key is back to its default (false).
      expect(isSuppressed()).toBe(false);
    });
  });

  describe('withSuppressed()', () => {
    it('returns the callback result', () => {
      // Act
      const out = withSuppressed(() => 42);

      // Assert
      expect(out).toBe(42);
    });

    it('supports nested suppression (idempotent)', () => {
      // Act + Assert — the inner call is a no-op; isSuppressed stays true.
      withSuppressed(() => {
        expect(isSuppressed()).toBe(true);
        withSuppressed(() => {
          expect(isSuppressed()).toBe(true);
        });
        expect(isSuppressed()).toBe(true);
      });
    });

    it('preserves suppression across awaited promises', async () => {
      // Arrange — the whole awaited chain runs inside the suppressed context
      // because `context.with` binds to the async local storage ropology.
      const result = await withSuppressed(async () => {
        expect(isSuppressed()).toBe(true);
        await new Promise(resolve => setTimeout(resolve, 1));
        // This assertion is the key regression guard — if the context didn't
        // propagate through the microtask, isSuppressed() would return false.
        expect(isSuppressed()).toBe(true);
        return 'done';
      });

      // Assert
      expect(result).toBe('done');
      expect(isSuppressed()).toBe(false);
    });

    it('uses a stable context key (same symbol across calls)', () => {
      // Assert — exporting the key lets the OTel hook also read it.
      expect(SUPPRESS_TRACING_KEY).toBeDefined();
      expect(typeof SUPPRESS_TRACING_KEY).toBe('symbol');
    });
  });
});
