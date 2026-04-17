/**
 * CLS (Continuation Local Storage) keys for request-scoped context.
 * These values persist throughout the async call chain of a single request.
 */
export enum ClsKey {
  /** Unique request identifier */
  REQUEST_ID = 'requestId',
  /** Authenticated user ID */
  USER_ID = 'userId',
  /** The user's tenant (company) — drives multi-tenant filtering everywhere */
  COMPANY_ID = 'companyId',
  /** Direct department memberships of the authenticated user */
  USER_DEPARTMENT_IDS = 'userDepartmentIds',
  /** When true, the tenant-scope Prisma extension is bypassed (seed scripts only) */
  BYPASS_TENANT_SCOPE = 'bypassTenantScope',
  /** OpenTelemetry trace ID */
  TRACE_ID = 'traceId',
  /** OpenTelemetry span ID */
  SPAN_ID = 'spanId',
}
