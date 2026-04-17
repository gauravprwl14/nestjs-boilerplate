import { PII_STRING_PATTERNS } from './string-patterns';

/**
 * Helper that applies every pattern in order, mirroring the loop in
 * {@link RedactorService.redactString}. Duplicated here so the patterns
 * can be tested in isolation without dragging in the service.
 */
function scrub(input: string): string {
  let out = input;
  for (const p of PII_STRING_PATTERNS) {
    out = out.replace(p.pattern, p.replacement);
  }
  return out;
}

describe('PII string patterns', () => {
  it('redacts email in free-form text', () => {
    // Arrange
    const input = 'hello alice@example.com bye';

    // Act
    const out = scrub(input);

    // Assert
    expect(out).toContain('[REDACTED:email]');
    expect(out).not.toContain('alice@example.com');
  });

  it('redacts bearer tokens but keeps the scheme', () => {
    // Arrange
    const input = 'Authorization: Bearer abc.def.ghi-jkl';

    // Act
    const out = scrub(input);

    // Assert
    expect(out).toContain('Bearer [REDACTED:token]');
    expect(out).not.toContain('abc.def.ghi-jkl');
  });

  it('redacts SSN and JWT inside a stacktrace-like string', () => {
    // Arrange
    const input = 'Error: user 123-45-6789 eyJabc.def.ghi failed';

    // Act
    const out = scrub(input);

    // Assert
    expect(out).toContain('[REDACTED:ssn]');
    expect(out).toContain('[REDACTED:jwt]');
    expect(out).not.toContain('123-45-6789');
    expect(out).not.toContain('eyJabc.def.ghi');
  });

  it('is idempotent — re-scrubbing produces identical output', () => {
    // Arrange
    const input = 'user a@b.co';

    // Act
    const once = scrub(input);
    const twice = scrub(once);

    // Assert
    expect(twice).toBe(once);
  });

  it('redacts a 16-digit credit card with spaces', () => {
    // Arrange
    const input = 'pan 4111 1111 1111 1111';

    // Act
    const out = scrub(input);

    // Assert
    expect(out).toContain('[REDACTED:card]');
    expect(out).not.toContain('4111 1111 1111 1111');
  });

  it('does not mangle plain numeric ids like orderId=12345', () => {
    // Arrange
    const input = 'orderId=12345';

    // Act
    const out = scrub(input);

    // Assert
    expect(out).toBe('orderId=12345');
  });

  it('credit-card pattern runs before phone_e164 so cards are tagged as cards', () => {
    // Arrange — ordering contract: card must precede phone to prevent the phone
    // regex from swallowing a partial card match first.
    const names = PII_STRING_PATTERNS.map(p => p.name);

    // Act
    const cardIdx = names.indexOf('credit_card');
    const phoneIdx = names.indexOf('phone_e164');

    // Assert
    expect(cardIdx).toBeGreaterThanOrEqual(0);
    expect(phoneIdx).toBeGreaterThanOrEqual(0);
    expect(cardIdx).toBeLessThan(phoneIdx);
  });
});
