import { DepartmentsController } from '@modules/departments/departments.controller';
import {
  CreateDepartmentDto,
  CreateDepartmentSchema,
} from '@modules/departments/dto/create-department.dto';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';
import { ErrorException } from '@errors/types/error-exception';

/**
 * Controller-level unit tests.
 *
 * We construct the controller directly with a mocked service (no TestingModule —
 * the guard, interceptor, CLS and middleware are exercised in their own suites).
 * This keeps the controller specs fast and focused on:
 *   1. Routing / parameter plumbing (service called with the right DTO).
 *   2. Response shape (what the controller returns before the TransformInterceptor).
 *   3. DTO validation wiring — we instantiate the same pipe the controller uses.
 */
describe('DepartmentsController', () => {
  let service: {
    create: jest.Mock;
    list: jest.Mock;
    listTree: jest.Mock;
  };
  let controller: DepartmentsController;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      list: jest.fn(),
      listTree: jest.fn(),
    };
    controller = new DepartmentsController(service as any);
  });

  describe('POST /departments (create)', () => {
    it('should delegate to service.create with the validated DTO', async () => {
      // --- ARRANGE ---
      const dto: CreateDepartmentDto = { name: 'Engineering', parentId: null };
      const created = { id: 'd1', name: 'Engineering', parentId: null, companyId: 'c1' };
      service.create.mockResolvedValueOnce(created);

      // --- ACT ---
      const result = await controller.create(dto);

      // --- ASSERT ---
      expect(service.create).toHaveBeenCalledWith(dto);
      expect(service.create).toHaveBeenCalledTimes(1);
      expect(result).toBe(created);
    });

    it('should return whatever the service returns (pass-through contract)', async () => {
      // --- ARRANGE ---
      service.create.mockResolvedValueOnce({ id: 'd2' });

      // --- ACT ---
      const result = await controller.create({ name: 'Ops' } as CreateDepartmentDto);

      // --- ASSERT ---
      expect(result).toEqual({ id: 'd2' });
    });

    it('should surface service errors without swallowing them', async () => {
      // --- ARRANGE ---
      const boom = new Error('boom');
      service.create.mockRejectedValueOnce(boom);

      // --- ACT + ASSERT ---
      await expect(controller.create({ name: 'Eng' } as CreateDepartmentDto)).rejects.toBe(boom);
    });
  });

  describe('GET /departments (list)', () => {
    it('should delegate to service.list with no arguments', async () => {
      // --- ARRANGE ---
      const rows = [{ id: 'd1', name: 'Eng', parentId: null, companyId: 'c1' }];
      service.list.mockResolvedValueOnce(rows);

      // --- ACT ---
      const result = await controller.list();

      // --- ASSERT ---
      expect(service.list).toHaveBeenCalledWith();
      expect(result).toBe(rows);
    });
  });

  describe('GET /departments/tree (tree)', () => {
    it('should delegate to service.listTree and return its output', async () => {
      // --- ARRANGE ---
      const tree = [{ id: 'root', name: 'R', parentId: null, children: [] }];
      service.listTree.mockResolvedValueOnce(tree);

      // --- ACT ---
      const result = await controller.tree();

      // --- ASSERT ---
      expect(service.listTree).toHaveBeenCalledWith();
      expect(result).toBe(tree);
    });
  });

  describe('DTO validation (ZodValidationPipe wired on POST)', () => {
    const pipe = new ZodValidationPipe(CreateDepartmentSchema);

    it('should accept a minimal valid payload', () => {
      // --- ACT ---
      const out = pipe.transform({ name: 'Eng' }, {} as any);

      // --- ASSERT ---
      expect(out).toEqual({ name: 'Eng' });
    });

    it('should accept a payload with a parentId uuid', () => {
      // --- ARRANGE ---
      const uuid = '11111111-1111-4111-8111-111111111111';

      // --- ACT ---
      const out = pipe.transform({ name: 'Eng', parentId: uuid }, {} as any);

      // --- ASSERT ---
      expect(out).toEqual({ name: 'Eng', parentId: uuid });
    });

    it('should reject an empty name with a VAL0001 ErrorException', () => {
      // --- ACT + ASSERT ---
      expect(() => pipe.transform({ name: '' }, {} as any)).toThrow(ErrorException);
    });

    it('should reject a non-uuid parentId', () => {
      // --- ACT + ASSERT ---
      expect(() => pipe.transform({ name: 'Eng', parentId: 'not-a-uuid' }, {} as any)).toThrow(
        ErrorException,
      );
    });

    it('should reject when name exceeds 120 characters', () => {
      // --- ARRANGE ---
      const longName = 'x'.repeat(121);

      // --- ACT + ASSERT ---
      expect(() => pipe.transform({ name: longName }, {} as any)).toThrow(ErrorException);
    });
  });
});
