/**
 * Tenant-scope extension behavioural tests.
 *
 * `tenantScopeExtension(cls)` returns the value produced by `Prisma.defineExtension`
 * — a function that takes a Prisma client and calls `.$extends(config)` on it.
 * To unit-test the config without a real Prisma runtime we:
 *   1. Pass a fake client whose `$extends` simply returns its argument; that
 *      surfaces the raw config object (with `query.$allModels.$allOperations`).
 *   2. Drive `$allOperations` directly with synthesised operation contexts.
 *
 * These tests cover:
 *   - bypass on non-tenant-scoped models
 *   - explicit BYPASS_TENANT_SCOPE flag
 *   - hard failure when CLS has no companyId
 *   - WHERE-clause injection on read ops
 *   - companyId injection + mismatch rejection on create/update/upsert/createMany
 *   - WHERE-clause scoping on update/delete/updateMany/deleteMany
 *
 * Full end-to-end behaviour lives in `test/integration/acl-matrix.spec.ts`.
 */
import { tenantScopeExtension } from '@database/extensions/tenant-scope.extension';
import { ClsKey } from '@common/cls/cls.constants';
import { ErrorException } from '@errors/types/error-exception';
import { AUZ } from '@errors/error-codes';

type Ctx = {
  model: string;
  operation: string;
  args: any;
  query: jest.Mock;
};

interface ExtractedConfig {
  name: string;
  query: {
    $allModels: {
      $allOperations: (ctx: Ctx) => unknown;
    };
  };
}

/** Drives the extension factory with a fake client and returns the raw config. */
const buildConfig = (cls: any): ExtractedConfig => {
  const fakeClient = {
    $extends: (arg: any) => arg,
  };
  const factory = tenantScopeExtension(cls);
  return (factory as any)(fakeClient) as ExtractedConfig;
};

const makeCls = (store: Record<string, unknown>) => ({
  get: jest.fn((key: string) => store[key]),
});

describe('tenantScopeExtension', () => {
  const TENANT = 'tenant-A';

  describe('guardrails', () => {
    it('should bypass non-tenant-scoped models and forward args unchanged', async () => {
      // --- ARRANGE ---
      const cls = makeCls({ [ClsKey.COMPANY_ID]: TENANT });
      const cfg = buildConfig(cls);
      const query = jest.fn().mockResolvedValue('passthrough');

      // --- ACT ---
      const result = await cfg.query.$allModels.$allOperations({
        model: 'Company',
        operation: 'findUnique',
        args: { where: { id: 'x' } },
        query,
      });

      // --- ASSERT ---
      expect(result).toBe('passthrough');
      expect(query).toHaveBeenCalledWith({ where: { id: 'x' } });
    });

    it('should bypass when ClsKey.BYPASS_TENANT_SCOPE is true', async () => {
      // --- ARRANGE ---
      const cls = makeCls({ [ClsKey.BYPASS_TENANT_SCOPE]: true });
      const cfg = buildConfig(cls);
      const query = jest.fn().mockResolvedValue('ok');

      // --- ACT ---
      await cfg.query.$allModels.$allOperations({
        model: 'Tweet',
        operation: 'findMany',
        args: { where: { content: 'hello' } },
        query,
      });

      // --- ASSERT --- args must be untouched (no companyId injection).
      expect(query).toHaveBeenCalledWith({ where: { content: 'hello' } });
    });

    it('should throw AUZ.CROSS_TENANT_ACCESS when tenant-scoped op runs with no companyId in CLS', () => {
      // --- ARRANGE --- the extension throws synchronously before awaiting `query`.
      const cls = makeCls({});
      const cfg = buildConfig(cls);
      const query = jest.fn();

      // --- ACT + ASSERT ---
      let caught: unknown;
      try {
        cfg.query.$allModels.$allOperations({
          model: 'Tweet',
          operation: 'findMany',
          args: {},
          query,
        });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(ErrorException);
      expect((caught as ErrorException).code).toBe(AUZ.CROSS_TENANT_ACCESS.code);
      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('read operations', () => {
    it('should inject companyId into the WHERE clause on findMany', async () => {
      // --- ARRANGE ---
      const cls = makeCls({ [ClsKey.COMPANY_ID]: TENANT });
      const cfg = buildConfig(cls);
      const query = jest.fn().mockResolvedValue([]);

      // --- ACT ---
      await cfg.query.$allModels.$allOperations({
        model: 'Department',
        operation: 'findMany',
        args: { where: { name: 'Eng' } },
        query,
      });

      // --- ASSERT --- existing where preserved, companyId appended.
      expect(query).toHaveBeenCalledWith({ where: { name: 'Eng', companyId: TENANT } });
    });

    it('should inject companyId into an empty WHERE on count', async () => {
      // --- ARRANGE ---
      const cls = makeCls({ [ClsKey.COMPANY_ID]: TENANT });
      const cfg = buildConfig(cls);
      const query = jest.fn().mockResolvedValue(0);

      // --- ACT ---
      await cfg.query.$allModels.$allOperations({
        model: 'Tweet',
        operation: 'count',
        args: {},
        query,
      });

      // --- ASSERT ---
      expect(query).toHaveBeenCalledWith({ where: { companyId: TENANT } });
    });
  });

  describe('write operations', () => {
    it('should inject companyId into create data when absent', async () => {
      // --- ARRANGE ---
      const cls = makeCls({ [ClsKey.COMPANY_ID]: TENANT });
      const cfg = buildConfig(cls);
      const query = jest.fn().mockResolvedValue({});

      // --- ACT ---
      await cfg.query.$allModels.$allOperations({
        model: 'Tweet',
        operation: 'create',
        args: { data: { content: 'x', authorId: 'u1' } },
        query,
      });

      // --- ASSERT ---
      expect(query).toHaveBeenCalledWith({
        data: { content: 'x', authorId: 'u1', companyId: TENANT },
      });
    });

    it('should pass create through when the supplied companyId matches CLS', async () => {
      // --- ARRANGE ---
      const cls = makeCls({ [ClsKey.COMPANY_ID]: TENANT });
      const cfg = buildConfig(cls);
      const query = jest.fn().mockResolvedValue({});

      // --- ACT ---
      await cfg.query.$allModels.$allOperations({
        model: 'Tweet',
        operation: 'create',
        args: { data: { content: 'x', companyId: TENANT } },
        query,
      });

      // --- ASSERT ---
      expect(query).toHaveBeenCalledWith({
        data: { content: 'x', companyId: TENANT },
      });
    });

    it('should throw on cross-tenant create (companyId mismatch)', () => {
      // --- ARRANGE ---
      const cls = makeCls({ [ClsKey.COMPANY_ID]: TENANT });
      const cfg = buildConfig(cls);
      const query = jest.fn();

      // --- ACT + ASSERT ---
      let caught: unknown;
      try {
        cfg.query.$allModels.$allOperations({
          model: 'Tweet',
          operation: 'create',
          args: { data: { companyId: 'tenant-B' } },
          query,
        });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(ErrorException);
      expect((caught as ErrorException).code).toBe(AUZ.CROSS_TENANT_ACCESS.code);
      expect(query).not.toHaveBeenCalled();
    });

    it('should map createMany rows and inject companyId on each', async () => {
      // --- ARRANGE ---
      const cls = makeCls({ [ClsKey.COMPANY_ID]: TENANT });
      const cfg = buildConfig(cls);
      const query = jest.fn().mockResolvedValue({ count: 2 });

      // --- ACT ---
      await cfg.query.$allModels.$allOperations({
        model: 'TweetDepartment',
        operation: 'createMany',
        args: {
          data: [
            { tweetId: 't1', departmentId: 'd1' },
            { tweetId: 't1', departmentId: 'd2' },
          ],
        },
        query,
      });

      // --- ASSERT ---
      expect(query).toHaveBeenCalledWith({
        data: [
          { tweetId: 't1', departmentId: 'd1', companyId: TENANT },
          { tweetId: 't1', departmentId: 'd2', companyId: TENANT },
        ],
      });
    });

    it('should reject a createMany row that carries a mismatched companyId', () => {
      // --- ARRANGE ---
      const cls = makeCls({ [ClsKey.COMPANY_ID]: TENANT });
      const cfg = buildConfig(cls);
      const query = jest.fn();

      // --- ACT + ASSERT ---
      let caught: unknown;
      try {
        cfg.query.$allModels.$allOperations({
          model: 'TweetDepartment',
          operation: 'createMany',
          args: { data: [{ tweetId: 't1', departmentId: 'd1', companyId: 'tenant-B' }] },
          query,
        });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(ErrorException);
      expect((caught as ErrorException).code).toBe(AUZ.CROSS_TENANT_ACCESS.code);
    });

    it('should force-scope the WHERE clause on update and preserve missing data companyId', async () => {
      // --- ARRANGE ---
      const cls = makeCls({ [ClsKey.COMPANY_ID]: TENANT });
      const cfg = buildConfig(cls);
      const query = jest.fn().mockResolvedValue({});

      // --- ACT ---
      await cfg.query.$allModels.$allOperations({
        model: 'Department',
        operation: 'update',
        args: { where: { id: 'd1' }, data: { name: 'New' } },
        query,
      });

      // --- ASSERT --- companyId must appear in WHERE but NOT be inserted into data when absent.
      expect(query).toHaveBeenCalledWith({
        where: { id: 'd1', companyId: TENANT },
        data: { name: 'New' },
      });
    });

    it('should force-scope WHERE on delete', async () => {
      // --- ARRANGE ---
      const cls = makeCls({ [ClsKey.COMPANY_ID]: TENANT });
      const cfg = buildConfig(cls);
      const query = jest.fn().mockResolvedValue({});

      // --- ACT ---
      await cfg.query.$allModels.$allOperations({
        model: 'Department',
        operation: 'delete',
        args: { where: { id: 'd1' } },
        query,
      });

      // --- ASSERT ---
      expect(query).toHaveBeenCalledWith({ where: { id: 'd1', companyId: TENANT } });
    });

    it('should inject upsert.create and leave upsert.update companyId-free when absent', async () => {
      // --- ARRANGE ---
      const cls = makeCls({ [ClsKey.COMPANY_ID]: TENANT });
      const cfg = buildConfig(cls);
      const query = jest.fn().mockResolvedValue({});

      // --- ACT ---
      await cfg.query.$allModels.$allOperations({
        model: 'Department',
        operation: 'upsert',
        args: {
          where: { id: 'd1' },
          create: { name: 'X' },
          update: { name: 'X2' },
        },
        query,
      });

      // --- ASSERT ---
      expect(query).toHaveBeenCalledWith({
        where: { id: 'd1', companyId: TENANT },
        create: { name: 'X', companyId: TENANT },
        update: { name: 'X2' },
      });
    });

    it('should reject upsert when update supplies a mismatched companyId', () => {
      // --- ARRANGE ---
      const cls = makeCls({ [ClsKey.COMPANY_ID]: TENANT });
      const cfg = buildConfig(cls);
      const query = jest.fn();

      // --- ACT + ASSERT ---
      let caught: unknown;
      try {
        cfg.query.$allModels.$allOperations({
          model: 'Department',
          operation: 'upsert',
          args: {
            where: { id: 'd1' },
            create: { name: 'X' },
            update: { name: 'X2', companyId: 'tenant-B' },
          },
          query,
        });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(ErrorException);
      expect((caught as ErrorException).code).toBe(AUZ.CROSS_TENANT_ACCESS.code);
    });

    it('should force-scope updateMany WHERE', async () => {
      // --- ARRANGE ---
      const cls = makeCls({ [ClsKey.COMPANY_ID]: TENANT });
      const cfg = buildConfig(cls);
      const query = jest.fn().mockResolvedValue({ count: 3 });

      // --- ACT ---
      await cfg.query.$allModels.$allOperations({
        model: 'Tweet',
        operation: 'updateMany',
        args: { where: { content: 'x' }, data: { content: 'y' } },
        query,
      });

      // --- ASSERT ---
      expect(query).toHaveBeenCalledWith({
        where: { content: 'x', companyId: TENANT },
        data: { content: 'y' },
      });
    });

    it('should force-scope deleteMany WHERE (no data to enforce)', async () => {
      // --- ARRANGE ---
      const cls = makeCls({ [ClsKey.COMPANY_ID]: TENANT });
      const cfg = buildConfig(cls);
      const query = jest.fn().mockResolvedValue({ count: 1 });

      // --- ACT ---
      await cfg.query.$allModels.$allOperations({
        model: 'Tweet',
        operation: 'deleteMany',
        args: { where: { authorId: 'u1' } },
        query,
      });

      // --- ASSERT ---
      expect(query).toHaveBeenCalledWith({ where: { authorId: 'u1', companyId: TENANT } });
    });
  });

  describe('unknown operations', () => {
    it('should forward args unchanged for an operation that is neither read nor write', async () => {
      // --- ARRANGE --- simulate a future-prisma or unknown op name.
      const cls = makeCls({ [ClsKey.COMPANY_ID]: TENANT });
      const cfg = buildConfig(cls);
      const query = jest.fn().mockResolvedValue(null);

      // --- ACT ---
      await cfg.query.$allModels.$allOperations({
        model: 'Tweet',
        operation: 'mystery',
        args: { foo: 'bar' },
        query,
      });

      // --- ASSERT ---
      expect(query).toHaveBeenCalledWith({ foo: 'bar' });
    });
  });
});
