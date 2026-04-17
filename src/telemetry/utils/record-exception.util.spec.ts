import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  ReadableSpan,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';

import { DAT } from '@errors/error-codes/database.errors';
import { ErrorException } from '@errors/types/error-exception';

import { recordExceptionOnSpan, setDefaultRedactString } from './record-exception.util';

// ─── Test fixture ─────────────────────────────────────────────────────────
const contextManager = new AsyncLocalStorageContextManager();
contextManager.enable();
context.setGlobalContextManager(contextManager);

const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});
trace.setGlobalTracerProvider(provider);
const tracer = trace.getTracer('record-exception-test');

beforeEach(() => exporter.reset());

afterAll(async () => {
  await provider.shutdown();
  trace.disable();
  context.disable();
});

/** Execute `fn` inside an active span and return the finished ReadableSpan. */
function runInSpan(fn: () => void): ReadableSpan {
  const span = tracer.startSpan('test-span');
  const ctx = trace.setSpan(context.active(), span);
  return context.with(ctx, () => {
    fn();
    span.end();
    const finished = exporter.getFinishedSpans();
    return finished[finished.length - 1];
  });
}

describe('recordExceptionOnSpan', () => {
  describe('basic event recording', () => {
    it('emits an "exception" event and sets ERROR status on active span', () => {
      // Arrange
      const err = new Error('boom');

      // Act
      const span = runInSpan(() => recordExceptionOnSpan(err));

      // Assert
      expect(span.events).toHaveLength(1);
      expect(span.events[0].name).toBe('exception');
      expect(span.events[0].attributes?.['exception.message']).toBe('boom');
      expect(span.status.code).toBe(SpanStatusCode.ERROR);
    });
  });

  describe('nested cause chains', () => {
    it('emits exception.cause.N events for each level of a nested cause chain', () => {
      // Arrange — 3-level wrap: outer <- middle <- leaf
      const leaf = new Error('leaf');
      const middle = new Error('middle');
      (middle as Error & { cause?: unknown }).cause = leaf;
      const outer = new Error('outer');
      (outer as Error & { cause?: unknown }).cause = middle;

      // Act
      const span = runInSpan(() => recordExceptionOnSpan(outer));

      // Assert
      const eventNames = span.events.map(e => e.name);
      expect(eventNames).toEqual(['exception', 'exception.cause.1', 'exception.cause.2']);
      expect(span.attributes['error.cause_depth']).toBe(3);
    });

    it('preserves Prisma-like code and meta on cause events', () => {
      // Arrange — outer wraps a Prisma-shaped leaf
      const prismaErr = Object.assign(new Error('Unique'), {
        code: 'P2002',
        meta: { target: ['email'] },
      });
      const outer = new Error('query failed');
      (outer as Error & { cause?: unknown }).cause = prismaErr;

      // Act
      const span = runInSpan(() => recordExceptionOnSpan(outer));

      // Assert — leaf is at exception.cause.1
      const causeEvent = span.events.find(e => e.name === 'exception.cause.1');
      expect(causeEvent).toBeDefined();
      expect(causeEvent?.attributes?.['exception.code']).toBe('P2002');
      expect(String(causeEvent?.attributes?.['exception.meta'])).toContain('target');
    });

    it('falls back gracefully when meta contains a circular reference', () => {
      // Arrange — JSON.stringify on circular meta throws; util must not bubble
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      const err = Object.assign(new Error('cycle'), { meta: circular });

      // Act
      const span = runInSpan(() => recordExceptionOnSpan(err));

      // Assert — event still recorded with sentinel value
      expect(span.events[0].attributes?.['exception.meta']).toBe('[unserialisable]');
    });
  });

  describe('ErrorException-specific attributes', () => {
    it('sets ErrorException-specific attributes (error.code, error.user_facing, …) on the span', () => {
      // Arrange
      const err = new ErrorException(DAT.NOT_FOUND);

      // Act
      const span = runInSpan(() => recordExceptionOnSpan(err));

      // Assert
      expect(span.attributes['error.code']).toBe(DAT.NOT_FOUND.code);
      expect(span.attributes['error.type']).toBe(DAT.NOT_FOUND.errorType);
      expect(span.attributes['error.category']).toBe(DAT.NOT_FOUND.errorCategory);
      expect(span.attributes['error.severity']).toBe(DAT.NOT_FOUND.severity);
      expect(span.attributes['error.user_facing']).toBe(DAT.NOT_FOUND.userFacing);
      expect(span.attributes['error.retryable']).toBe(DAT.NOT_FOUND.retryable);
      expect(span.attributes['error.cause_depth']).toBe(1);
    });
  });

  describe('redaction', () => {
    it('applies redactString to message and stacktrace when provided', () => {
      // Arrange
      const err = new Error('user a@x.com failed');

      // Act
      const span = runInSpan(() =>
        recordExceptionOnSpan(err, {
          redactString: s => s.replace('a@x.com', '[REDACTED]'),
        }),
      );

      // Assert
      expect(span.events[0].attributes?.['exception.message']).toBe('user [REDACTED] failed');
      expect(String(span.events[0].attributes?.['exception.stacktrace'])).not.toContain('a@x.com');
    });
  });

  describe('status control', () => {
    it('does not set status when setStatus=false', () => {
      // Arrange
      const err = new Error('boom');

      // Act
      const span = runInSpan(() => recordExceptionOnSpan(err, { setStatus: false }));

      // Assert
      expect(span.status.code).toBe(SpanStatusCode.UNSET);
    });
  });

  describe('no-op when span is missing', () => {
    it('no-ops when no active span and no span passed', () => {
      // Act + Assert — should not throw even without active span context
      expect(() => recordExceptionOnSpan(new Error('nope'))).not.toThrow();
    });
  });

  describe('default redactString hook', () => {
    afterEach(() => setDefaultRedactString(undefined));

    it('falls back to the module-level default when opts.redactString is absent', () => {
      // Arrange
      setDefaultRedactString(s => s.replace('a@x.com', '[DEFAULT]'));
      const err = new Error('user a@x.com failed');

      // Act
      const span = runInSpan(() => recordExceptionOnSpan(err));

      // Assert
      expect(span.events[0].attributes?.['exception.message']).toBe('user [DEFAULT] failed');
    });

    it('lets per-call redactString override the default', () => {
      // Arrange — default scrubber would produce [DEFAULT] but per-call wins
      setDefaultRedactString(s => s.replace('a@x.com', '[DEFAULT]'));
      const err = new Error('user a@x.com failed');

      // Act
      const span = runInSpan(() =>
        recordExceptionOnSpan(err, {
          redactString: s => s.replace('a@x.com', '[PER-CALL]'),
        }),
      );

      // Assert
      expect(span.events[0].attributes?.['exception.message']).toBe('user [PER-CALL] failed');
    });

    it('clears the default when setDefaultRedactString(undefined) is called', () => {
      // Arrange — set then clear
      setDefaultRedactString(s => s.replace('a@x.com', '[DEFAULT]'));
      setDefaultRedactString(undefined);
      const err = new Error('user a@x.com failed');

      // Act
      const span = runInSpan(() => recordExceptionOnSpan(err));

      // Assert — raw message preserved
      expect(span.events[0].attributes?.['exception.message']).toBe('user a@x.com failed');
    });
  });

  describe('explicit span override', () => {
    it('accepts an explicit span via opts.span instead of the active one', () => {
      // Arrange
      const span = tracer.startSpan('explicit-span');

      // Act — no active context, pass span directly
      recordExceptionOnSpan(new Error('boom'), { span });
      span.end();

      // Assert
      const finished = exporter.getFinishedSpans();
      const recorded = finished.find(s => s.name === 'explicit-span');
      expect(recorded).toBeDefined();
      expect(recorded?.events).toHaveLength(1);
      expect(recorded?.events[0].name).toBe('exception');
      expect(recorded?.status.code).toBe(SpanStatusCode.ERROR);
    });
  });
});
