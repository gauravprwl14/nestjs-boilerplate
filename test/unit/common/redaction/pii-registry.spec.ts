import { DEFAULT_PII_PATHS, PII_CATEGORIES, PII_PATH_GROUPS } from '@common/redaction/pii-registry';

describe('PII registry', () => {
  it('exposes at least one credential and one identifier path', () => {
    // Arrange + Act: import-time constants
    // Assert
    expect(DEFAULT_PII_PATHS).toEqual(expect.arrayContaining(['*.password', '*.ssn']));
  });

  it('has no duplicate paths', () => {
    // Arrange + Act
    const dupes = DEFAULT_PII_PATHS.filter((p, i, arr) => arr.indexOf(p) !== i);

    // Assert
    expect(dupes).toEqual([]);
  });

  it('every group declares a category, severity, and at least one path', () => {
    // Arrange
    const validCategories = new Set(Object.values(PII_CATEGORIES));

    // Act + Assert
    for (const group of Object.values(PII_PATH_GROUPS)) {
      expect(group.category).toBeDefined();
      expect(validCategories.has(group.category)).toBe(true);
      expect(['high', 'medium']).toContain(group.severity);
      expect(group.paths.length).toBeGreaterThan(0);
      expect(typeof group.description).toBe('string');
    }
  });

  it('DEFAULT_PII_PATHS is frozen to prevent runtime mutation', () => {
    // Arrange + Act + Assert
    expect(Object.isFrozen(DEFAULT_PII_PATHS)).toBe(true);
  });
});
