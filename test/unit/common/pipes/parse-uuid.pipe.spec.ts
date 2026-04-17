import { ParseUuidPipe } from '@common/pipes/parse-uuid.pipe';
import { ErrorException } from '@errors/types/error-exception';

describe('ParseUuidPipe', () => {
  const pipe = new ParseUuidPipe();
  const meta = (data?: string) => ({ type: 'param' as const, metatype: String, data }) as const;

  it('returns the value unchanged when it is a valid UUID v4', () => {
    // --- ARRANGE ---
    const uuid = '11111111-2222-4333-8444-555555555555';

    // --- ACT ---
    const result = pipe.transform(uuid, meta('id'));

    // --- ASSERT ---
    expect(result).toBe(uuid);
  });

  it('accepts uppercase hex', () => {
    // --- ARRANGE ---
    const uuid = 'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE';

    // --- ACT & ASSERT ---
    expect(pipe.transform(uuid, meta('id'))).toBe(uuid);
  });

  it('throws VAL0001 for a non-UUID string', () => {
    // --- ACT & ASSERT ---
    try {
      pipe.transform('not-a-uuid', meta('id'));
      throw new Error('should have thrown');
    } catch (e: unknown) {
      expect(ErrorException.isErrorException(e)).toBe(true);
      const err = e as ErrorException;
      expect(err.code).toBe('VAL0001');
      expect(err.details).toEqual([{ field: 'id', message: 'Must be a valid UUID v4' }]);
      expect(err.message).toContain("'id'");
    }
  });

  it('rejects UUID v1 (wrong version)', () => {
    // --- ARRANGE --- Version 1 has a '1' in the version slot
    const v1 = '11111111-2222-1333-8444-555555555555';

    // --- ACT & ASSERT ---
    expect(() => pipe.transform(v1, meta('id'))).toThrow(ErrorException);
  });

  it('rejects UUID with invalid variant bits', () => {
    // --- ARRANGE --- Variant must be 8/9/a/b
    const bad = '11111111-2222-4333-7444-555555555555';

    // --- ACT & ASSERT ---
    expect(() => pipe.transform(bad, meta('id'))).toThrow(ErrorException);
  });

  it("defaults the field name to 'id' when metadata.data is undefined", () => {
    // --- ACT & ASSERT ---
    try {
      pipe.transform('bad', meta(undefined));
      throw new Error('should have thrown');
    } catch (e: unknown) {
      const err = e as ErrorException;
      expect(err.details![0].field).toBe('id');
    }
  });
});
