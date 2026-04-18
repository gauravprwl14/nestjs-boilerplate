import { __resetAllowPIIAudit, shouldAuditAllowPII } from '@common/redaction/allow-pii.util';

describe('shouldAuditAllowPII', () => {
  beforeEach(() => {
    // Arrange — reset module-level audit set so each test starts clean.
    __resetAllowPIIAudit();
  });

  it('returns true only on the first emission of a (path, callsite) pair', () => {
    // Arrange + Act + Assert
    expect(shouldAuditAllowPII('*.email', 'file.ts:42')).toBe(true);
    expect(shouldAuditAllowPII('*.email', 'file.ts:42')).toBe(false);
    expect(shouldAuditAllowPII('*.email', 'file.ts:42')).toBe(false);
  });

  it('treats different callsites for the same path as independent keys', () => {
    // Arrange + Act + Assert
    expect(shouldAuditAllowPII('*.email', 'file.ts:42')).toBe(true);
    expect(shouldAuditAllowPII('*.email', 'other.ts:7')).toBe(true);
    expect(shouldAuditAllowPII('*.email', 'file.ts:42')).toBe(false);
    expect(shouldAuditAllowPII('*.email', 'other.ts:7')).toBe(false);
  });

  it('treats different paths at the same callsite as independent keys', () => {
    // Arrange + Act + Assert
    expect(shouldAuditAllowPII('*.email', 'file.ts:42')).toBe(true);
    expect(shouldAuditAllowPII('*.password', 'file.ts:42')).toBe(true);
    expect(shouldAuditAllowPII('*.email', 'file.ts:42')).toBe(false);
  });

  it('__resetAllowPIIAudit clears remembered emissions for tests', () => {
    // Arrange
    shouldAuditAllowPII('*.email', 'file.ts:42');

    // Act
    __resetAllowPIIAudit();

    // Assert — the first call after reset is "first" again
    expect(shouldAuditAllowPII('*.email', 'file.ts:42')).toBe(true);
  });
});
