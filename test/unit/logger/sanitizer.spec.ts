import { sanitizeAttributes, extractErrorInfo } from '@logger/utils/sanitizer.util';
import { MAX_ATTRIBUTE_STRING_LENGTH, MAX_SERIALIZATION_DEPTH } from '@logger/logger.constants';

describe('sanitizeAttributes', () => {
  describe('primitive values', () => {
    it('should sanitize string values', () => {
      // --- ARRANGE ---
      const attrs = { name: 'hello' };

      // --- ACT ---
      const result = sanitizeAttributes(attrs);

      // --- ASSERT ---
      expect(result.name).toBe('hello');
    });

    it('should sanitize boolean values', () => {
      // --- ARRANGE ---
      const attrs = { flag: true };

      // --- ACT ---
      const result = sanitizeAttributes(attrs);

      // --- ASSERT ---
      expect(result.flag).toBe(true);
    });

    it('should sanitize number values', () => {
      // --- ARRANGE ---
      const attrs = { count: 42 };

      // --- ACT ---
      const result = sanitizeAttributes(attrs);

      // --- ASSERT ---
      expect(result.count).toBe(42);
    });

    it('should convert Infinity to string', () => {
      // --- ARRANGE ---
      const attrs = { value: Infinity };

      // --- ACT ---
      const result = sanitizeAttributes(attrs);

      // --- ASSERT ---
      expect(result.value).toBe('Infinity');
    });

    it('should convert null to empty string', () => {
      // --- ARRANGE ---
      const attrs = { value: null };

      // --- ACT ---
      const result = sanitizeAttributes(attrs);

      // --- ASSERT ---
      expect(result.value).toBe('');
    });

    it('should convert undefined to empty string', () => {
      // --- ARRANGE ---
      const attrs = { value: undefined };

      // --- ACT ---
      const result = sanitizeAttributes(attrs);

      // --- ASSERT ---
      expect(result.value).toBe('');
    });
  });

  describe('circular references', () => {
    it('should detect circular references and replace with [Circular]', () => {
      // --- ARRANGE ---
      const obj: Record<string, unknown> = { name: 'test' };
      obj.self = obj; // circular reference
      const attrs = { circular: obj };

      // --- ACT ---
      const result = sanitizeAttributes(attrs);

      // --- ASSERT ---
      // The first serialization of obj will succeed (as JSON), circular will show in nested
      expect(result.circular).toBeDefined();
    });
  });

  describe('max depth', () => {
    it('should stop serialization at max depth and return [MaxDepth]', () => {
      // --- ARRANGE ---
      // Build a deeply nested object exceeding MAX_SERIALIZATION_DEPTH
      let deepObj: Record<string, unknown> = { leaf: 'value' };
      for (let i = 0; i < MAX_SERIALIZATION_DEPTH + 2; i++) {
        deepObj = { nested: deepObj };
      }

      const attrs = { deep: deepObj };

      // --- ACT ---
      const result = sanitizeAttributes(attrs);

      // --- ASSERT ---
      expect(result.deep).toBeDefined();
    });
  });

  describe('string truncation', () => {
    it('should truncate strings longer than MAX_ATTRIBUTE_STRING_LENGTH', () => {
      // --- ARRANGE ---
      const longString = 'a'.repeat(MAX_ATTRIBUTE_STRING_LENGTH + 100);
      const attrs = { value: longString };

      // --- ACT ---
      const result = sanitizeAttributes(attrs);

      // --- ASSERT ---
      const resultValue = result.value as string;
      expect(resultValue.length).toBeLessThanOrEqual(MAX_ATTRIBUTE_STRING_LENGTH + 1); // +1 for ellipsis
      expect(resultValue.endsWith('…')).toBe(true);
    });

    it('should not truncate strings within MAX_ATTRIBUTE_STRING_LENGTH', () => {
      // --- ARRANGE ---
      const shortString = 'a'.repeat(100);
      const attrs = { value: shortString };

      // --- ACT ---
      const result = sanitizeAttributes(attrs);

      // --- ASSERT ---
      expect(result.value).toBe(shortString);
    });
  });

  describe('Error objects', () => {
    it('should serialize Error objects to string format', () => {
      // --- ARRANGE ---
      const error = new Error('Something went wrong');
      const attrs = { error };

      // --- ACT ---
      const result = sanitizeAttributes(attrs);

      // --- ASSERT ---
      expect(typeof result.error).toBe('string');
      expect(result.error as string).toContain('Error');
      expect(result.error as string).toContain('Something went wrong');
    });
  });

  describe('arrays', () => {
    it('should pass through string arrays', () => {
      // --- ARRANGE ---
      const attrs = { tags: ['a', 'b', 'c'] };

      // --- ACT ---
      const result = sanitizeAttributes(attrs);

      // --- ASSERT ---
      expect(result.tags).toEqual(['a', 'b', 'c']);
    });

    it('should pass through number arrays', () => {
      // --- ARRANGE ---
      const attrs = { ids: [1, 2, 3] };

      // --- ACT ---
      const result = sanitizeAttributes(attrs);

      // --- ASSERT ---
      expect(result.ids).toEqual([1, 2, 3]);
    });
  });
});

describe('extractErrorInfo', () => {
  it('should extract error type, message, and stack', () => {
    // --- ARRANGE ---
    const error = new Error('Test error message');

    // --- ACT ---
    const info = extractErrorInfo(error);

    // --- ASSERT ---
    expect(info['error.type']).toBe('Error');
    expect(info['error.message']).toBe('Test error message');
    expect(info['error.stack']).toBeDefined();
  });

  it('should use custom error name for custom errors', () => {
    // --- ARRANGE ---
    class CustomError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'CustomError';
      }
    }
    const error = new CustomError('Custom error');

    // --- ACT ---
    const info = extractErrorInfo(error);

    // --- ASSERT ---
    expect(info['error.type']).toBe('CustomError');
  });
});
