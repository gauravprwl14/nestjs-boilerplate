import {
  REDACTION_CENSOR,
  REDACTION_MAX_STRING_LENGTH,
} from '@common/redaction/redaction.constants';
import { RedactorService } from '@common/redaction/redactor.service';

describe('RedactorService', () => {
  describe('redactObject', () => {
    let redactor: RedactorService;

    beforeEach(() => {
      // Arrange — one fresh instance per test so the internal fast-redact
      // closure cannot leak mutations across tests.
      redactor = new RedactorService();
    });

    it('redacts nested credential fields (user.password, user.email)', () => {
      // Arrange
      const input = { user: { email: 'a@x.com', password: 'hunter2' } };

      // Act
      const out = redactor.redactObject(input);

      // Assert
      expect(out.user.password).toBe(REDACTION_CENSOR);
      expect(out.user.email).toBe(REDACTION_CENSOR);
    });

    it('redacts array of objects (users[*].ssn across multiple indices)', () => {
      // Arrange
      const input = {
        users: [{ ssn: '111-22-3333' }, { ssn: '444-55-6666' }, { ssn: '777-88-9999' }],
      };

      // Act
      const out = redactor.redactObject(input);

      // Assert — every index must be redacted
      expect(out.users[0].ssn).toBe(REDACTION_CENSOR);
      expect(out.users[1].ssn).toBe(REDACTION_CENSOR);
      expect(out.users[2].ssn).toBe(REDACTION_CENSOR);
    });

    it('allowPII opt-in unmasks a specific path while still redacting others', () => {
      // Arrange
      const input = { user: { email: 'a@x.com', password: 'secret' } };

      // Act
      const out = redactor.redactObject(input, { allow: ['*.email'] });

      // Assert
      expect(out.user.email).toBe('a@x.com');
      expect(out.user.password).toBe(REDACTION_CENSOR);
    });

    it('is a no-op on primitives (string, number, null)', () => {
      // Arrange + Act + Assert
      expect(redactor.redactObject('string' as unknown as object)).toBe('string');
      expect(redactor.redactObject(42 as unknown as object)).toBe(42);
      expect(redactor.redactObject(null as unknown as object)).toBeNull();
      expect(redactor.redactObject(undefined as unknown as object)).toBeUndefined();
    });

    it('handles circular references without throwing', () => {
      // Arrange — a self-referential object with a PII field.
      interface Cycle {
        password: string;
        self: Cycle | null;
      }
      const a: Cycle = { password: 'p', self: null };
      a.self = a;

      // Act + Assert
      expect(() => redactor.redactObject(a)).not.toThrow();
      expect(a.password).toBe(REDACTION_CENSOR);
    });

    it('redacts deeply nested paths like a.b.c.d.password', () => {
      // Arrange
      const input = { a: { b: { c: { d: { password: 'pw', name: 'alice' } } } } };

      // Act
      const out = redactor.redactObject(input);

      // Assert
      expect(out.a.b.c.d.password).toBe(REDACTION_CENSOR);
      expect(out.a.b.c.d.name).toBe('alice');
    });

    it('leaves non-matching fields alone (user.name, user.id)', () => {
      // Arrange
      const input = { user: { id: 'u_1', name: 'alice', role: 'admin' } };

      // Act
      const out = redactor.redactObject(input);

      // Assert
      expect(out.user.id).toBe('u_1');
      expect(out.user.name).toBe('alice');
      expect(out.user.role).toBe('admin');
    });

    it('is idempotent — re-running redaction on already-censored output produces the same object', () => {
      // Arrange
      const input = { user: { password: 'pw', email: 'a@x.com', name: 'alice' } };

      // Act
      const first = redactor.redactObject(input);
      const firstSnapshot = JSON.parse(JSON.stringify(first));
      const second = redactor.redactObject(first);

      // Assert
      expect(JSON.parse(JSON.stringify(second))).toEqual(firstSnapshot);
      expect(second.user.password).toBe(REDACTION_CENSOR);
      expect(second.user.email).toBe(REDACTION_CENSOR);
    });

    it('redacts non-string sensitive values (numeric ssn is still censored)', () => {
      // Arrange — fast-redact operates on the key, not the value's type.
      const input = { user: { ssn: 111223333 } };

      // Act
      const out = redactor.redactObject(input) as { user: { ssn: unknown } };

      // Assert
      expect(out.user.ssn).toBe(REDACTION_CENSOR);
    });

    it('does not attach a restore() that leaks the original value to later readers', () => {
      // Arrange — fast-redact with serialize:false exposes .restore() on the
      // *redactor function*, not on the output. The output we hand back must
      // keep the censor in place after the call returns.
      const input = { user: { password: 'hunter2' } };

      // Act
      const out = redactor.redactObject(input);

      // Assert — the returned object has no restore prop clinging to it
      expect((out as unknown as { restore?: unknown }).restore).toBeUndefined();
      expect(out.user.password).toBe(REDACTION_CENSOR);
    });
  });

  describe('redactFlatAttributes', () => {
    let redactor: RedactorService;

    beforeEach(() => {
      redactor = new RedactorService();
    });

    it('redacts OTel-style flat attribute keys (method.args.user.password)', () => {
      // Arrange
      const input = {
        'method.args.user.password': 'p',
        'method.args.user.name': 'alice',
      };

      // Act
      const out = redactor.redactFlatAttributes(input);

      // Assert
      expect(out['method.args.user.password']).toBe(REDACTION_CENSOR);
      expect(out['method.args.user.name']).toBe('alice');
    });

    it('redacts flat indexed array paths (req.body.users.0.ssn)', () => {
      // Arrange
      const input = {
        'req.body.users.0.ssn': '111-22-3333',
        'req.body.users.1.ssn': '444-55-6666',
        'req.body.users.0.name': 'alice',
      };

      // Act
      const out = redactor.redactFlatAttributes(input);

      // Assert
      expect(out['req.body.users.0.ssn']).toBe(REDACTION_CENSOR);
      expect(out['req.body.users.1.ssn']).toBe(REDACTION_CENSOR);
      expect(out['req.body.users.0.name']).toBe('alice');
    });

    it('unflatten/flatten round-trip preserves non-redacted values exactly', () => {
      // Arrange
      const input = {
        'meta.requestId': 'req-123',
        'meta.count': 42,
        'meta.active': true,
      };

      // Act
      const out = redactor.redactFlatAttributes(input);

      // Assert
      expect(out).toEqual(input);
    });

    it('handles empty input { } -> { }', () => {
      // Arrange + Act
      const out = redactor.redactFlatAttributes({});

      // Assert
      expect(out).toEqual({});
    });
  });

  describe('redactString', () => {
    let redactor: RedactorService;

    beforeEach(() => {
      redactor = new RedactorService();
    });

    it('scrubs email and JWT from free-form text', () => {
      // Arrange
      const input = 'user a@x.com token eyJa.b.c failed';

      // Act
      const out = redactor.redactString(input);

      // Assert
      expect(out).not.toContain('a@x.com');
      expect(out).not.toContain('eyJa.b.c');
      expect(out).toContain('[REDACTED:email]');
      expect(out).toContain('[REDACTED:jwt]');
    });

    it('scrubs bearer tokens keeping the scheme (Bearer [REDACTED:token])', () => {
      // Arrange
      const input = 'Authorization: Bearer abc.def.ghi-jkl';

      // Act
      const out = redactor.redactString(input);

      // Assert
      expect(out).toContain('Bearer [REDACTED:token]');
      expect(out).not.toContain('abc.def.ghi-jkl');
    });

    it('scrubs SSN and a 16-digit credit card', () => {
      // Arrange
      const input = 'user 123-45-6789 paid with 4111 1111 1111 1111';

      // Act
      const out = redactor.redactString(input);

      // Assert
      expect(out).toContain('[REDACTED:ssn]');
      expect(out).toContain('[REDACTED:card]');
      expect(out).not.toContain('123-45-6789');
      expect(out).not.toContain('4111 1111 1111 1111');
    });

    it('is idempotent — re-scrubbing produces identical output', () => {
      // Arrange
      const input = 'email a@b.co token eyJa.b.c card 4111 1111 1111 1111';

      // Act
      const once = redactor.redactString(input);
      const twice = redactor.redactString(once);

      // Assert
      expect(twice).toBe(once);
    });

    it('returns non-string input unchanged (undefined, null, number)', () => {
      // Arrange + Act + Assert
      expect(redactor.redactString(undefined as unknown as string)).toBeUndefined();
      expect(redactor.redactString(null as unknown as string)).toBeNull();
      expect(redactor.redactString(42 as unknown as string)).toBe(42);
    });

    it('truncates strings that exceed REDACTION_MAX_STRING_LENGTH', () => {
      // Arrange
      const huge = 'x'.repeat(100_000);

      // Act
      const out = redactor.redactString(huge);

      // Assert — bounded by max length + a short truncation marker
      expect(out.length).toBeLessThanOrEqual(REDACTION_MAX_STRING_LENGTH + 32);
      expect(out).toMatch(/truncated/);
    });

    it('does NOT mangle plain numeric IDs like orderId=12345', () => {
      // Arrange
      const input = 'orderId=12345';

      // Act
      const out = redactor.redactString(input);

      // Assert
      expect(out).toBe('orderId=12345');
    });

    it('returns an empty string unchanged', () => {
      // Arrange + Act + Assert
      expect(redactor.redactString('')).toBe('');
    });
  });
});
