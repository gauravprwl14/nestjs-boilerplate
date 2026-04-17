import { ClsKey } from '@common/cls/cls.constants';

describe('ClsKey enum', () => {
  it('should map each member to its camelCase string key', () => {
    // --- ASSERT ---
    expect(ClsKey.REQUEST_ID).toBe('requestId');
    expect(ClsKey.USER_ID).toBe('userId');
    expect(ClsKey.COMPANY_ID).toBe('companyId');
    expect(ClsKey.USER_DEPARTMENT_IDS).toBe('userDepartmentIds');
    expect(ClsKey.BYPASS_TENANT_SCOPE).toBe('bypassTenantScope');
    expect(ClsKey.TRACE_ID).toBe('traceId');
    expect(ClsKey.SPAN_ID).toBe('spanId');
  });

  it('should expose exactly the expected member names', () => {
    // --- ARRANGE ---
    const memberNames = Object.keys(ClsKey);

    // --- ASSERT ---
    expect(memberNames.sort()).toEqual(
      [
        'REQUEST_ID',
        'USER_ID',
        'COMPANY_ID',
        'USER_DEPARTMENT_IDS',
        'BYPASS_TENANT_SCOPE',
        'TRACE_ID',
        'SPAN_ID',
      ].sort(),
    );
  });

  it('should have no duplicate values', () => {
    // --- ARRANGE ---
    const values = Object.values(ClsKey);

    // --- ASSERT ---
    expect(new Set(values).size).toBe(values.length);
  });
});
