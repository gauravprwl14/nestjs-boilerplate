import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';

import { setDefaultRedactString } from '@telemetry/utils/record-exception.util';
import { Trace } from '@telemetry/decorators/trace.decorator';

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

describe('@Trace decorator', () => {
  describe('span creation', () => {
    it('creates a child span with the given name', () => {
      // Arrange
      class Svc {
        @Trace({ spanName: 'svc.work' })
        work(): string {
          return 'ok';
        }
      }

      // Act
      const result = new Svc().work();

      // Assert
      expect(result).toBe('ok');
      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0].name).toBe('svc.work');
      expect(spans[0].status.code).toBe(SpanStatusCode.OK);
    });

    it('defaults the span name to <Class>.<method> when spanName is omitted', () => {
      // Arrange
      class Defaults {
        @Trace()
        run(): number {
          return 42;
        }
      }

      // Act
      new Defaults().run();

      // Assert
      const [s] = exporter.getFinishedSpans();
      expect(s.name).toBe('Defaults.run');
    });
  });

  describe('error recording', () => {
    it('records exception and sets ERROR status on sync throw', () => {
      // Arrange
      class Bad {
        @Trace({ spanName: 'bad.sync' })
        boom(): never {
          throw new Error('sync-boom');
        }
      }

      // Act / Assert
      expect(() => new Bad().boom()).toThrow('sync-boom');
      const [s] = exporter.getFinishedSpans();
      expect(s.status.code).toBe(SpanStatusCode.ERROR);
      expect(s.events.map(e => e.name)).toContain('exception');
      expect(s.events[0].attributes?.['exception.message']).toBe('sync-boom');
    });

    it('records exception and sets ERROR status on async rejection', async () => {
      // Arrange
      class BadAsync {
        @Trace({ spanName: 'bad.async' })
        async reject(): Promise<never> {
          throw new Error('async-boom');
        }
      }

      // Act / Assert
      await expect(new BadAsync().reject()).rejects.toThrow('async-boom');
      const [s] = exporter.getFinishedSpans();
      expect(s.status.code).toBe(SpanStatusCode.ERROR);
      expect(s.events[0].name).toBe('exception');
      expect(s.events[0].attributes?.['exception.message']).toBe('async-boom');
    });

    it('re-throws the original error unchanged (identity preserved)', () => {
      // Arrange
      const originalError = new Error('same-ref');
      class Keeper {
        @Trace()
        throwOriginal(): never {
          throw originalError;
        }
      }

      // Act / Assert
      let caught: unknown;
      try {
        new Keeper().throwOriginal();
      } catch (err) {
        caught = err;
      }
      expect(caught).toBe(originalError);
    });
  });

  describe('this binding', () => {
    it('preserves `this` inside wrapped sync methods', () => {
      // Arrange
      class WithState {
        public readonly x = 7;

        @Trace()
        read(): number {
          return this.x;
        }
      }

      // Act / Assert
      expect(new WithState().read()).toBe(7);
    });

    it('preserves `this` inside wrapped async methods', async () => {
      // Arrange
      class WithStateAsync {
        public readonly x = 9;

        @Trace()
        async read(): Promise<number> {
          return this.x;
        }
      }

      // Act / Assert
      await expect(new WithStateAsync().read()).resolves.toBe(9);
    });
  });

  describe('default redactString hook integration', () => {
    afterEach(() => setDefaultRedactString(undefined));

    it('uses setDefaultRedactString when opts.redactString is not provided', () => {
      // Arrange — simple email scrubber registered process-wide
      setDefaultRedactString(s => s.replace('@', '-AT-'));
      class EmailThrower {
        @Trace({ spanName: 'email.throw' })
        boom(): never {
          throw new Error('user a@x.com rejected');
        }
      }

      // Act
      expect(() => new EmailThrower().boom()).toThrow();

      // Assert — message has been scrubbed by the default redactor
      const [s] = exporter.getFinishedSpans();
      const msg = s.events[0].attributes?.['exception.message'];
      expect(msg).toBe('user a-AT-x.com rejected');
    });

    it('emits the unredacted message once the default hook is cleared', () => {
      // Arrange — set then immediately clear so the next throw is raw
      setDefaultRedactString(s => s.replace('@', '-AT-'));
      setDefaultRedactString(undefined);
      class EmailThrower2 {
        @Trace({ spanName: 'email.throw2' })
        boom(): never {
          throw new Error('user b@y.com failed');
        }
      }

      // Act
      expect(() => new EmailThrower2().boom()).toThrow();

      // Assert — unredacted message is preserved on the span event
      const [s] = exporter.getFinishedSpans();
      expect(s.events[0].attributes?.['exception.message']).toBe('user b@y.com failed');
    });
  });
});
