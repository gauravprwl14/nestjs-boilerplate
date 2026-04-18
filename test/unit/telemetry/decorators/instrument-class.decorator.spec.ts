import { context, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';

import { InstrumentClass } from '@telemetry/decorators/instrument-class.decorator';

// ─── Test fixture ─────────────────────────────────────────────────────────
const contextManager = new AsyncLocalStorageContextManager();
contextManager.enable();
context.setGlobalContextManager(contextManager);

const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});
trace.setGlobalTracerProvider(provider);

beforeEach(() => exporter.reset());

afterAll(async () => {
  await provider.shutdown();
  trace.disable();
  context.disable();
});

describe('@InstrumentClass decorator', () => {
  describe('own methods', () => {
    it('wraps own methods and emits a span named <Class>.<method>', () => {
      // Arrange
      @InstrumentClass()
      class OwnOnly {
        doWork(): string {
          return 'ok';
        }
      }

      // Act
      const result = new OwnOnly().doWork();

      // Assert
      expect(result).toBe('ok');
      const [s] = exporter.getFinishedSpans();
      expect(s.name).toBe('OwnOnly.doWork');
    });
  });

  describe('inherited methods', () => {
    it('wraps methods inherited from a parent class (full prototype walk)', () => {
      // Arrange — parent is NOT decorated; only the child has @InstrumentClass
      class Base {
        foo(): string {
          return 'foo';
        }
      }
      @InstrumentClass()
      class Child extends Base {
        bar(): string {
          return 'bar';
        }
      }

      // Act — call BOTH inherited and own methods on a Child instance
      const c = new Child();
      expect(c.foo()).toBe('foo');
      expect(c.bar()).toBe('bar');

      // Assert — two spans, one per method, both prefixed with the subclass
      const names = exporter.getFinishedSpans().map(s => s.name);
      expect(names).toContain('Child.foo');
      expect(names).toContain('Child.bar');
      expect(names).toHaveLength(2);
    });
  });

  describe('skipped descriptors', () => {
    it('skips the constructor', () => {
      // Arrange
      @InstrumentClass()
      class C {
        constructor() {
          // no-op — constructor must never be wrapped as a traced method.
        }
        work(): void {
          /* no-op */
        }
      }

      // Act
      new C().work();

      // Assert — only `work` is traced, not `constructor`
      const names = exporter.getFinishedSpans().map(s => s.name);
      expect(names).toEqual(['C.work']);
      expect(names.some(n => n.includes('constructor'))).toBe(false);
    });

    it('skips non-function descriptors (getters, value properties)', () => {
      // Arrange
      @InstrumentClass()
      class WithGetter {
        get computed(): number {
          return 1;
        }
        work(): string {
          return 'ok';
        }
      }

      // Act — read the getter and call the method
      const w = new WithGetter();
      expect(w.computed).toBe(1);
      expect(w.work()).toBe('ok');

      // Assert — only the function method emits a span
      const names = exporter.getFinishedSpans().map(s => s.name);
      expect(names).toEqual(['WithGetter.work']);
    });
  });

  describe('options.exclude', () => {
    it('does not wrap methods listed in options.exclude', () => {
      // Arrange
      @InstrumentClass({ exclude: ['internal'] })
      class Mixed {
        traced(): string {
          return 't';
        }
        internal(): string {
          return 'i';
        }
      }

      // Act
      const m = new Mixed();
      m.traced();
      m.internal();

      // Assert — only the non-excluded method produced a span
      const names = exporter.getFinishedSpans().map(s => s.name);
      expect(names).toEqual(['Mixed.traced']);
    });
  });

  describe('this binding', () => {
    it('preserves `this` inside wrapped methods', () => {
      // Arrange
      @InstrumentClass()
      class Stateful {
        public readonly seed = 11;
        read(): number {
          return this.seed * 2;
        }
      }

      // Act / Assert
      expect(new Stateful().read()).toBe(22);
      const [s] = exporter.getFinishedSpans();
      expect(s.name).toBe('Stateful.read');
    });
  });
});
