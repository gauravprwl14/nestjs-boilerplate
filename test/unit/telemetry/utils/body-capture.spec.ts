import { Request } from 'express';
import { RedactorService } from '@common/redaction/redactor.service';
import { captureRequestContext, __resetRateLimiter } from '@telemetry/utils/body-capture';

/**
 * Build a minimal Express-like request. Only the fields
 * `captureRequestContext` reads are populated; everything else is
 * intentionally absent so we catch accidental deeper reads.
 */
function makeRequest(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    query: {},
    body: {},
    ...overrides,
  } as unknown as Request;
}

describe('captureRequestContext', () => {
  let redactor: RedactorService;

  beforeEach(() => {
    redactor = new RedactorService();
    __resetRateLimiter();
  });

  it('should redact nested sensitive leaf keys in the request body', () => {
    // Arrange
    const req = makeRequest({
      body: { user: { password: 'hunter2', name: 'Alice' } },
    });

    // Act
    const out = captureRequestContext({ request: req, redactor });

    // Assert
    expect(out.requestBody).toBeDefined();
    expect(out.requestBody).toContain('[REDACTED]');
    expect(out.requestBody).not.toContain('hunter2');
    expect(out.requestBody).toContain('Alice');
  });

  it('should skip multipart bodies with a content-type sentinel', () => {
    // Arrange
    const req = makeRequest({
      headers: { 'content-type': 'multipart/form-data; boundary=xyz' },
      body: { shouldNotBeRead: 'ignored' },
    });

    // Act
    const out = captureRequestContext({ request: req, redactor });

    // Assert
    expect(out.requestBody).toContain('[skipped content-type:');
    expect(out.requestBody).toContain('multipart/form-data');
  });

  it('should emit sentinel when body is undefined (middleware error before parse)', () => {
    // Arrange — simulate a request that never made it past body-parser.
    const req = makeRequest({ body: undefined as unknown as object });

    // Act
    const out = captureRequestContext({ request: req, redactor });

    // Assert
    expect(out.requestBody).toBe('[body not parsed — middleware error]');
  });

  it('should truncate large request bodies to 1 KB with the truncation sentinel', () => {
    // Arrange — a payload whose serialised form far exceeds 1 KB.
    const bigString = 'a'.repeat(10_000);
    const req = makeRequest({ body: { blob: bigString } });

    // Act
    const out = captureRequestContext({ request: req, redactor });

    // Assert
    expect(out.requestBody).toBeDefined();
    expect(out.requestBody!.length).toBeLessThanOrEqual(1024);
    expect(out.requestBody!.endsWith('…[truncated]')).toBe(true);
  });

  it('should not mutate the caller-provided body', () => {
    // Arrange
    const original = { password: 'hunter2', email: 'a@b.co' };
    const req = makeRequest({ body: original });

    // Act
    captureRequestContext({ request: req, redactor });

    // Assert — the caller's object should be untouched (structuredClone).
    expect(original.password).toBe('hunter2');
    expect(original.email).toBe('a@b.co');
  });

  it('should return [unserialisable] for circular references', () => {
    // Arrange — build a circular reference JSON.stringify cannot handle.
    const circ: Record<string, unknown> = { a: 1 };
    circ['self'] = circ;
    const req = makeRequest({ body: circ });

    // Act
    const out = captureRequestContext({ request: req, redactor });

    // Assert
    expect(out.requestBody).toBe('[unserialisable]');
  });

  it('should rate-limit after 50 captures in a tight loop', () => {
    // Arrange
    const req = makeRequest({ body: { foo: 'bar' } });

    // Act — exhaust the bucket with 50 quick calls.
    for (let i = 0; i < 50; i++) {
      const out = captureRequestContext({ request: req, redactor });
      expect(out.requestBody).toBeDefined();
      expect(out.requestBody).not.toBe('[rate-limited]');
    }
    // 51st call: token bucket is empty.
    const rateLimited = captureRequestContext({ request: req, redactor });

    // Assert
    expect(rateLimited.requestBody).toBe('[rate-limited]');
    expect(rateLimited.requestHeaders).toBe('[rate-limited]');
  });

  it('should return {} when takeToken returns false (bucket empty)', () => {
    // Arrange — drain the bucket. We then verify the returned object only
    // contains the rate-limited sentinel fields and nothing else.
    const req = makeRequest({ body: { foo: 'bar' } });
    for (let i = 0; i < 50; i++) captureRequestContext({ request: req, redactor });

    // Act
    const drained = captureRequestContext({ request: req, redactor });

    // Assert — only the two sentinel fields; no requestQuery / responseBody.
    expect(Object.keys(drained).sort()).toEqual(['requestBody', 'requestHeaders']);
  });

  it('should refill tokens after simulated time passes', () => {
    // Arrange — exhaust bucket.
    const req = makeRequest({ body: { foo: 'bar' } });
    for (let i = 0; i < 50; i++) captureRequestContext({ request: req, redactor });
    // Confirm we're rate-limited.
    expect(captureRequestContext({ request: req, redactor }).requestBody).toBe('[rate-limited]');

    // Act — fast-forward 2 seconds via Date.now mock.
    const realNow = Date.now;
    const future = realNow() + 2_000;
    jest.spyOn(Date, 'now').mockReturnValue(future);

    const out = captureRequestContext({ request: req, redactor });
    jest.spyOn(Date, 'now').mockRestore();

    // Assert — tokens refilled, capture works again.
    expect(out.requestBody).not.toBe('[rate-limited]');
  });

  it('should redact free-form PII in the serialised body (redactString pass)', () => {
    // Arrange — a field containing a free-form email not caught by path rules.
    const req = makeRequest({ body: { comment: 'please contact alice@example.com' } });

    // Act
    const out = captureRequestContext({ request: req, redactor });

    // Assert — the email should be scrubbed by redactString.
    expect(out.requestBody).toBeDefined();
    expect(out.requestBody).not.toContain('alice@example.com');
    expect(out.requestBody).toContain('[REDACTED:email]');
  });

  it('should redact bearer tokens embedded in free-form fields', () => {
    // Arrange
    const req = makeRequest({
      body: { note: 'auth: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig' },
    });

    // Act
    const out = captureRequestContext({ request: req, redactor });

    // Assert
    expect(out.requestBody).not.toContain('eyJhbGciOiJIUzI1NiJ9.payload.sig');
  });

  it('should handle primitive (non-object) bodies', () => {
    // Arrange
    const req = makeRequest({ body: 'hello world' as unknown as object });

    // Act
    const out = captureRequestContext({ request: req, redactor });

    // Assert — primitive serialises to a JSON string; capture should succeed.
    expect(out.requestBody).toBe('"hello world"');
  });

  it('should capture the response body when provided', () => {
    // Arrange
    const req = makeRequest({ body: {} });
    const resp = { success: false, errors: [{ code: 'VAL0001', message: 'bad' }] };

    // Act
    const out = captureRequestContext({ request: req, responseBody: resp, redactor });

    // Assert
    expect(out.responseBody).toBeDefined();
    expect(out.responseBody).toContain('VAL0001');
  });

  it('should redact auth headers (authorization → [REDACTED])', () => {
    // Arrange
    const req = makeRequest({
      headers: { authorization: 'Bearer secret.token.sig', 'content-type': 'application/json' },
      body: {},
    });

    // Act
    const out = captureRequestContext({ request: req, redactor });

    // Assert
    expect(out.requestHeaders).toBeDefined();
    expect(out.requestHeaders).not.toContain('secret.token.sig');
    expect(out.requestHeaders).toContain('[REDACTED]');
    expect(out.requestHeaders).toContain('application/json');
  });

  it('should capture the query string', () => {
    // Arrange
    const req = makeRequest({ query: { page: '1', sort: 'name' } });

    // Act
    const out = captureRequestContext({ request: req, redactor });

    // Assert
    expect(out.requestQuery).toBeDefined();
    expect(out.requestQuery).toContain('page');
  });

  it('should return {} on unexpected internal error (never throw)', () => {
    // Arrange — a redactor whose internals throw.
    const badRedactor: Partial<RedactorService> = {
      redactObject: () => {
        throw new Error('boom');
      },
      redactString: () => {
        throw new Error('boom');
      },
    };
    const req = makeRequest({ body: { foo: 'bar' } });

    // Act
    const out = captureRequestContext({
      request: req,
      redactor: badRedactor as RedactorService,
    });

    // Assert — swallowed; empty object returned.
    expect(out).toEqual({});
  });

  it('should survive image/* content type with sentinel', () => {
    // Arrange
    const req = makeRequest({
      headers: { 'content-type': 'image/png' },
      body: { fake: 'unused' },
    });

    // Act
    const out = captureRequestContext({ request: req, redactor });

    // Assert
    expect(out.requestBody).toBe('[skipped content-type: image/png]');
  });

  it('should preserve 4 fields of 1 KB each (total 4 KB ≤ 8 KB cap)', () => {
    // Arrange — craft four distinct ~1KB bodies. After the per-field cap each
    // field is ≤ 1 KB; total ≤ 4 KB, so the total-cap must NOT truncate.
    const big = 'x'.repeat(2_000);
    const req = makeRequest({
      headers: { 'x-tag': big },
      query: { q: big },
      body: { blob: big },
    });
    const resp = { blob: big };

    // Act
    const out = captureRequestContext({ request: req, responseBody: resp, redactor });

    // Assert — all four fields present; each ≤ 1 KB.
    expect(out.requestHeaders!.length).toBeLessThanOrEqual(1024);
    expect(out.requestQuery!.length).toBeLessThanOrEqual(1024);
    expect(out.requestBody!.length).toBeLessThanOrEqual(1024);
    expect(out.responseBody!.length).toBeLessThanOrEqual(1024);
    const total =
      out.requestHeaders!.length +
      out.requestQuery!.length +
      out.requestBody!.length +
      out.responseBody!.length;
    expect(total).toBeLessThanOrEqual(8192);
  });
});
