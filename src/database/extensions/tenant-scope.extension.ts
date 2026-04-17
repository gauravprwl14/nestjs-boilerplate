import { Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { ClsKey } from '@common/cls/cls.constants';
import { ErrorException } from '@errors/types/error-exception';
import { AUZ } from '@errors/error-codes';

/**
 * Models that are tenant-scoped. Every read gets a companyId WHERE clause
 * injected; every write must carry the matching companyId or it is rejected.
 *
 * `Company` and `User` are NOT in this list — User identity is resolved BEFORE
 * tenant context is established (mock-auth middleware looks up the user by id),
 * and Company IS the tenant record. The Department/Tweet aggregates and their
 * pivots inherit tenant scope.
 */
const TENANT_SCOPED_MODELS = new Set<string>([
  'Department',
  'UserDepartment',
  'Tweet',
  'TweetDepartment',
]);

const READ_OPS = new Set(['findUnique', 'findFirst', 'findMany', 'count', 'aggregate', 'groupBy']);
const WRITE_OPS = new Set([
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
]);

/**
 * Builds the Prisma tenant-scope extension. Apply once in PrismaService:
 *
 *     this.$extends(tenantScopeExtension(clsService))
 *
 * The extension reads `companyId` from CLS on every operation. If CLS has no
 * companyId (seed scripts, migrations), scoping is skipped — gate this by
 * setting ClsKey.BYPASS_TENANT_SCOPE = true explicitly in those contexts so
 * accidental absence never becomes a silent bypass.
 *
 * Known blindspots: raw SQL via `$queryRaw`/`$executeRaw` is NOT intercepted.
 * Nested `connect` into tenant-scoped relations is NOT validated — services
 * must keep writes flat and pre-validate IDs. See README for details.
 */
export const tenantScopeExtension = (cls: ClsService) =>
  Prisma.defineExtension(prisma =>
    prisma.$extends({
      name: 'tenant-scope',
      query: {
        $allModels: {
          $allOperations({ model, operation, args, query }) {
            if (!model || !TENANT_SCOPED_MODELS.has(model)) {
              return query(args);
            }
            if (cls.get<boolean>(ClsKey.BYPASS_TENANT_SCOPE)) {
              return query(args);
            }
            const companyId = cls.get<string | undefined>(ClsKey.COMPANY_ID);
            if (!companyId) {
              // No tenant context and no explicit bypass → deny, don't silently leak.
              throw new ErrorException(AUZ.CROSS_TENANT_ACCESS, {
                message: `Tenant-scoped ${operation} on ${model} attempted without a companyId in request context.`,
              });
            }

            if (READ_OPS.has(operation)) {
              const next = { ...(args as Record<string, unknown>) };
              const existingWhere = (args as { where?: Record<string, unknown> }).where ?? {};
              next.where = { ...existingWhere, companyId };
              return query(next);
            }

            if (WRITE_OPS.has(operation)) {
              return enforceWriteTenant(operation, args, companyId, model, query);
            }

            return query(args);
          },
        },
      },
    }),
  );

/**
 * Handles the write side: inject `companyId` into `data` when absent, and
 * reject when the caller supplied a different companyId. For update/delete,
 * also scope the WHERE clause so a wrong-tenant id returns "not found" instead
 * of silently modifying another tenant's row.
 */
function enforceWriteTenant(
  operation: string,
  args: unknown,
  companyId: string,
  model: string,
  query: (a: unknown) => Promise<unknown>,
): Promise<unknown> {
  const a = (args as Record<string, unknown>) ?? {};
  const next: Record<string, unknown> = { ...a };

  // Data-bearing ops: validate/inject companyId on every row.
  if (operation === 'create' || operation === 'update' || operation === 'upsert') {
    if (operation === 'create') {
      next.data = enforceRow(a.data, companyId, model);
    } else if (operation === 'update') {
      next.data = enforceRow(a.data, companyId, model, /*allowMissing*/ true);
    } else if (operation === 'upsert') {
      next.create = enforceRow(a.create, companyId, model);
      next.update = enforceRow(a.update, companyId, model, /*allowMissing*/ true);
    }
  } else if (operation === 'createMany') {
    const data = a.data;
    if (Array.isArray(data)) {
      next.data = data.map(row => enforceRow(row, companyId, model));
    } else {
      next.data = enforceRow(data, companyId, model);
    }
  } else if (operation === 'updateMany') {
    next.data = enforceRow(a.data, companyId, model, /*allowMissing*/ true);
  }

  // WHERE-bearing ops: always force-scope.
  if (operation !== 'create' && operation !== 'createMany') {
    const where = (a.where as Record<string, unknown>) ?? {};
    next.where = { ...where, companyId };
  }

  return query(next);
}

function enforceRow(
  row: unknown,
  companyId: string,
  model: string,
  allowMissing = false,
): Record<string, unknown> {
  const r = (row as Record<string, unknown>) ?? {};
  const supplied = r.companyId;
  if (supplied === undefined || supplied === null) {
    if (allowMissing) return r;
    return { ...r, companyId };
  }
  if (supplied !== companyId) {
    throw new ErrorException(AUZ.CROSS_TENANT_ACCESS, {
      message: `Write to ${model} carried companyId ${String(
        supplied,
      )} but tenant context is ${companyId}.`,
    });
  }
  return r;
}
