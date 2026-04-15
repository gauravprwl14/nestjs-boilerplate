import { ClsKey } from '@common/cls/cls.constants';

describe('ClsKey', () => {
  it('should have REQUEST_ID enum value', () => {
    // --- ASSERT ---
    expect(ClsKey.REQUEST_ID).toBeDefined();
    expect(typeof ClsKey.REQUEST_ID).toBe('string');
  });

  it('should have USER_ID enum value', () => {
    // --- ASSERT ---
    expect(ClsKey.USER_ID).toBeDefined();
    expect(typeof ClsKey.USER_ID).toBe('string');
  });

  it('should have TRACE_ID enum value', () => {
    // --- ASSERT ---
    expect(ClsKey.TRACE_ID).toBeDefined();
    expect(typeof ClsKey.TRACE_ID).toBe('string');
  });

  it('should have SPAN_ID enum value', () => {
    // --- ASSERT ---
    expect(ClsKey.SPAN_ID).toBeDefined();
    expect(typeof ClsKey.SPAN_ID).toBe('string');
  });

  it('should have correct string values matching expected keys', () => {
    // --- ASSERT ---
    expect(ClsKey.REQUEST_ID).toBe('requestId');
    expect(ClsKey.USER_ID).toBe('userId');
    expect(ClsKey.TRACE_ID).toBe('traceId');
    expect(ClsKey.SPAN_ID).toBe('spanId');
  });

  it('should have all four expected keys', () => {
    // --- ARRANGE ---
    const keys = Object.keys(ClsKey);

    // --- ASSERT ---
    expect(keys).toContain('REQUEST_ID');
    expect(keys).toContain('USER_ID');
    expect(keys).toContain('TRACE_ID');
    expect(keys).toContain('SPAN_ID');
  });
});
