import type { ClientRequest, IncomingMessage } from 'http';
import type { Span } from '@opentelemetry/api';
import { context } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';

import { RedactorService } from '@common/redaction/redactor.service';
import { buildOutboundHooks } from '@telemetry/hooks/outbound-http.hooks';
import { withSuppressed } from '@telemetry/utils/suppress-tracing';

// Install a context manager so suppression can round-trip.
const contextManager = new AsyncLocalStorageContextManager();
contextManager.enable();
context.setGlobalContextManager(contextManager);

// ─── Mock helpers ─────────────────────────────────────────────────────────

function makeSpan(): { span: Span; attributes: Record<string, unknown> } {
  const attributes: Record<string, unknown> = {};
  const span = {
    setAttribute: jest.fn((k: string, v: unknown) => {
      attributes[k] = v;
    }),
  } as unknown as Span;
  return { span, attributes };
}

function makeRequest(headers: Record<string, string>): ClientRequest {
  const headerStore = new Map<string, string>();
  for (const [k, v] of Object.entries(headers)) headerStore.set(k.toLowerCase(), v);
  return {
    getHeaderNames: () => [...headerStore.keys()],
    getHeader: (name: string) => headerStore.get(name.toLowerCase()),
  } as unknown as ClientRequest;
}

function makeResponse(statusCode: number, headers: Record<string, string>): IncomingMessage {
  return { statusCode, headers } as unknown as IncomingMessage;
}

describe('buildOutboundHooks', () => {
  let redactor: RedactorService;

  beforeEach(() => {
    redactor = new RedactorService();
  });

  it('skips response header capture on success (status < 400)', () => {
    // Arrange
    const hooks = buildOutboundHooks({ redactor });
    const { span, attributes } = makeSpan();

    // Act
    hooks.responseHook!(span, makeResponse(200, { 'content-type': 'application/json' }));

    // Assert — no headers captured on 2xx (fast-path).
    expect(attributes['http.client.response.headers_redacted']).toBeUndefined();
  });

  it('captures response headers on 5xx, preserving allowlisted headers', () => {
    // Arrange
    const hooks = buildOutboundHooks({ redactor });
    const { span, attributes } = makeSpan();

    // Act — remote returned 500 with a WWW-Authenticate hint plus a custom
    // vendor header that must be masked.
    hooks.responseHook!(
      span,
      makeResponse(500, {
        'content-type': 'application/json',
        'www-authenticate': 'Bearer realm="api"',
        'x-vendor-secret': 'should-not-leak',
      }),
    );

    // Assert
    const captured = attributes['http.client.response.headers_redacted'] as string;
    expect(captured).toBeDefined();
    // Allowlisted header name preserved; the Bearer scheme is preserved even
    // though the opaque token tail is scrubbed by redactString.
    expect(captured).toContain('www-authenticate');
    expect(captured).toContain('Bearer');
    expect(captured).not.toContain('should-not-leak');
    expect(captured).toContain('[REDACTED]');
  });

  it('masks non-allowlisted outbound request headers (vendor api key)', () => {
    // Arrange
    const hooks = buildOutboundHooks({ redactor });
    const { span, attributes } = makeSpan();
    const req = makeRequest({
      'content-type': 'application/json',
      'x-vendor-api-key': 'supersecret',
      'x-correlation-id': 'trace-123',
    });

    // Act
    hooks.requestHook!(span, req);

    // Assert
    const captured = attributes['http.client.request.headers_redacted'] as string;
    expect(captured).toContain('application/json');
    expect(captured).toContain('trace-123');
    expect(captured).not.toContain('supersecret');
    expect(captured).toContain('[REDACTED]');
  });

  it('ignores outbound traffic to the configured exporter host', () => {
    // Arrange — exporter URL is the collector; the hook must not capture.
    const hooks = buildOutboundHooks({ redactor, exporterUrl: 'http://collector:4318' });
    const ignore = hooks.ignoreOutgoingRequestHook!;

    // Act + Assert — collector host is skipped.
    expect(ignore({ hostname: 'collector', port: 4318 } as never)).toBe(true);
    // A different host proceeds normally.
    expect(ignore({ hostname: 'api.example.com', port: 443 } as never)).toBe(false);
  });

  it('ignores all outbound requests while suppression is active', () => {
    // Arrange
    const hooks = buildOutboundHooks({ redactor });
    const ignore = hooks.ignoreOutgoingRequestHook!;

    // Act + Assert — default (unsuppressed) lets requests through.
    expect(ignore({ hostname: 'api.example.com' } as never)).toBe(false);
    withSuppressed(() => {
      expect(ignore({ hostname: 'api.example.com' } as never)).toBe(true);
    });
    // Suppression ends with the callback.
    expect(ignore({ hostname: 'api.example.com' } as never)).toBe(false);
  });

  it('never throws when the response shape is unexpected', () => {
    // Arrange
    const hooks = buildOutboundHooks({ redactor });
    const { span } = makeSpan();

    // Act + Assert — a null-ish response must not throw.
    expect(() => hooks.responseHook!(span, undefined as never)).not.toThrow();
    expect(() => hooks.requestHook!(span, undefined as never)).not.toThrow();
  });
});
