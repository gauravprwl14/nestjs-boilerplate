import type { ExportResult } from '@opentelemetry/core';
import { ExportResultCode } from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';

import {
  DEFAULT_DROP_PREDICATES,
  FilteringSpanExporter,
  type SpanDropPredicate,
} from '@telemetry/exporters/filtering-span-exporter';

/** Minimal stand-in for a `ReadableSpan` — only the `name` field is used here. */
function fakeSpan(name: string): ReadableSpan {
  return { name } as unknown as ReadableSpan;
}

interface MockExporterOptions {
  shutdownImpl?: () => Promise<void>;
  flushImpl?: (() => Promise<void>) | null; // null -> omit forceFlush entirely
  exportImpl?: (spans: ReadableSpan[], cb: (r: ExportResult) => void) => void;
}

function mockInner(opts: MockExporterOptions = {}) {
  const exportCalls: ReadableSpan[][] = [];
  const shutdownCalls: number[] = [];
  const flushCalls: number[] = [];

  const defaultExport = (spans: ReadableSpan[], cb: (r: ExportResult) => void): void => {
    exportCalls.push(spans);
    cb({ code: ExportResultCode.SUCCESS });
  };

  const inner: SpanExporter = {
    export: opts.exportImpl ?? defaultExport,
    shutdown: () => {
      shutdownCalls.push(1);
      return opts.shutdownImpl ? opts.shutdownImpl() : Promise.resolve();
    },
    ...(opts.flushImpl === null
      ? {}
      : {
          forceFlush: () => {
            flushCalls.push(1);
            return opts.flushImpl ? opts.flushImpl() : Promise.resolve();
          },
        }),
  };

  return { inner, exportCalls, shutdownCalls, flushCalls };
}

describe('FilteringSpanExporter', () => {
  describe('export', () => {
    it('drops `middleware - <anonymous>` spans via the default predicate', () => {
      // --- ARRANGE ---
      const { inner, exportCalls } = mockInner();
      const exporter = new FilteringSpanExporter(inner);
      const spans = [
        fakeSpan('middleware - <anonymous>'),
        fakeSpan('middleware - helmetMiddleware'),
        fakeSpan('GET /api/v1/health'),
      ];
      const cb = jest.fn();

      // --- ACT ---
      exporter.export(spans, cb);

      // --- ASSERT --- the <anonymous> span is filtered out; others pass through.
      expect(exportCalls).toHaveLength(1);
      expect(exportCalls[0].map(s => s.name)).toEqual([
        'middleware - helmetMiddleware',
        'GET /api/v1/health',
      ]);
      expect(cb).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
    });

    it('keeps the span when a predicate throws (fail-open)', () => {
      // --- ARRANGE --- predicate throws on every span; wrapper should keep all.
      const thrower: SpanDropPredicate = () => {
        throw new Error('rule bug');
      };
      const { inner, exportCalls } = mockInner();
      const exporter = new FilteringSpanExporter(inner, [thrower]);
      const spans = [fakeSpan('a'), fakeSpan('b')];

      // --- ACT ---
      exporter.export(spans, () => undefined);

      // --- ASSERT ---
      expect(exportCalls[0].map(s => s.name)).toEqual(['a', 'b']);
    });

    it('passes every span through when the predicate list is empty', () => {
      // --- ARRANGE ---
      const { inner, exportCalls } = mockInner();
      const exporter = new FilteringSpanExporter(inner, []);
      const spans = [
        fakeSpan('middleware - <anonymous>'),
        fakeSpan('middleware - helmetMiddleware'),
      ];

      // --- ACT ---
      exporter.export(spans, () => undefined);

      // --- ASSERT ---
      expect(exportCalls[0].map(s => s.name)).toEqual([
        'middleware - <anonymous>',
        'middleware - helmetMiddleware',
      ]);
    });

    it('honours a custom predicate passed via constructor', () => {
      // --- ARRANGE ---
      const dropAllHealth: SpanDropPredicate = span => span.name.includes('/health');
      const { inner, exportCalls } = mockInner();
      const exporter = new FilteringSpanExporter(inner, [dropAllHealth]);
      const spans = [fakeSpan('GET /api/v1/health'), fakeSpan('POST /api/v1/tweets')];

      // --- ACT ---
      exporter.export(spans, () => undefined);

      // --- ASSERT ---
      expect(exportCalls[0].map(s => s.name)).toEqual(['POST /api/v1/tweets']);
    });

    it('still invokes inner.export with an empty array when all spans are dropped', () => {
      // --- ARRANGE ---
      const { inner, exportCalls } = mockInner();
      const exporter = new FilteringSpanExporter(inner);
      const spans = [fakeSpan('middleware - <anonymous>'), fakeSpan('middleware - <anonymous>')];
      const cb = jest.fn();

      // --- ACT ---
      exporter.export(spans, cb);

      // --- ASSERT --- caller's resultCallback contract must still fire.
      expect(exportCalls).toHaveLength(1);
      expect(exportCalls[0]).toEqual([]);
      expect(cb).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
    });

    it('reports FAILED via callback when inner.export throws synchronously', () => {
      // --- ARRANGE --- defensive backstop — inner exporters should call back
      // with FAILED rather than throwing, but we guard anyway.
      const throwingInner: SpanExporter = {
        export: () => {
          throw new Error('network down');
        },
        shutdown: () => Promise.resolve(),
      };
      const exporter = new FilteringSpanExporter(throwingInner);
      const cb = jest.fn();

      // --- ACT ---
      exporter.export([fakeSpan('GET /x')], cb);

      // --- ASSERT ---
      expect(cb).toHaveBeenCalledTimes(1);
      const result = cb.mock.calls[0][0] as ExportResult;
      expect(result.code).toBe(ExportResultCode.FAILED);
      expect(result.error?.message).toBe('network down');
    });
  });

  describe('lifecycle pass-through', () => {
    it('delegates shutdown() to the inner exporter', async () => {
      // --- ARRANGE ---
      const { inner, shutdownCalls } = mockInner();
      const exporter = new FilteringSpanExporter(inner);

      // --- ACT ---
      await exporter.shutdown();

      // --- ASSERT ---
      expect(shutdownCalls).toEqual([1]);
    });

    it('propagates shutdown() errors from the inner exporter', async () => {
      // --- ARRANGE ---
      const { inner } = mockInner({
        shutdownImpl: () => Promise.reject(new Error('shutdown failed')),
      });
      const exporter = new FilteringSpanExporter(inner);

      // --- ACT / ASSERT ---
      await expect(exporter.shutdown()).rejects.toThrow('shutdown failed');
    });

    it('delegates forceFlush() to the inner exporter', async () => {
      // --- ARRANGE ---
      const { inner, flushCalls } = mockInner();
      const exporter = new FilteringSpanExporter(inner);

      // --- ACT ---
      await exporter.forceFlush();

      // --- ASSERT ---
      expect(flushCalls).toEqual([1]);
    });

    it('resolves forceFlush() when the inner exporter has no forceFlush method', async () => {
      // --- ARRANGE --- omit forceFlush on inner (valid per SpanExporter interface).
      const { inner } = mockInner({ flushImpl: null });
      const exporter = new FilteringSpanExporter(inner);

      // --- ACT / ASSERT --- must not throw, must resolve.
      await expect(exporter.forceFlush()).resolves.toBeUndefined();
    });

    it('propagates forceFlush() errors from the inner exporter', async () => {
      // --- ARRANGE ---
      const { inner } = mockInner({
        flushImpl: () => Promise.reject(new Error('flush timed out')),
      });
      const exporter = new FilteringSpanExporter(inner);

      // --- ACT / ASSERT ---
      await expect(exporter.forceFlush()).rejects.toThrow('flush timed out');
    });
  });

  describe('DEFAULT_DROP_PREDICATES', () => {
    it('drops only the exact `middleware - <anonymous>` name', () => {
      // --- ARRANGE / ACT / ASSERT --- lightweight unit on the predicate itself
      expect(DEFAULT_DROP_PREDICATES).toHaveLength(1);
      const pred = DEFAULT_DROP_PREDICATES[0];
      expect(pred(fakeSpan('middleware - <anonymous>'))).toBe(true);
      expect(pred(fakeSpan('middleware - helmetMiddleware'))).toBe(false);
      expect(pred(fakeSpan('GET /health'))).toBe(false);
    });
  });
});
