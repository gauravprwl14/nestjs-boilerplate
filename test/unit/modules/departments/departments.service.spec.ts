import { DepartmentsService, buildTree } from '@modules/departments/departments.service';
import { ClsKey } from '@common/cls/cls.constants';
import { ErrorException } from '@errors/types/error-exception';
import { DAT } from '@errors/error-codes';

describe('DepartmentsService', () => {
  const cls = { get: jest.fn() } as any;
  const departmentsDb = {
    findManyByCompany: jest.fn(),
    findByIdInCompany: jest.fn(),
    create: jest.fn(),
  } as any;
  const service = new DepartmentsService(departmentsDb, cls);

  beforeEach(() => {
    jest.clearAllMocks();
    cls.get.mockImplementation((k: string) => (k === ClsKey.COMPANY_ID ? 'c1' : undefined));
  });

  describe('list', () => {
    it('should return departments scoped to the caller company', async () => {
      // --- ARRANGE ---
      const rows = [{ id: 'd1', name: 'A', companyId: 'c1', parentId: null }];
      departmentsDb.findManyByCompany.mockResolvedValueOnce(rows);

      // --- ACT ---
      const result = await service.list();

      // --- ASSERT ---
      expect(result).toBe(rows);
      expect(departmentsDb.findManyByCompany).toHaveBeenCalledWith('c1');
      expect(departmentsDb.findManyByCompany).toHaveBeenCalledTimes(1);
    });

    it('should throw DAT0010 when CLS has no companyId', async () => {
      // --- ARRANGE --- AuthContextGuard normally catches this; defensive branch.
      cls.get.mockReturnValue(undefined);

      // --- ACT + ASSERT ---
      await expect(service.list()).rejects.toMatchObject({
        code: DAT.COMPANY_NOT_FOUND.code,
      });
      expect(departmentsDb.findManyByCompany).not.toHaveBeenCalled();
    });
  });

  describe('listTree', () => {
    it('should load flat rows and return a nested tree', async () => {
      // --- ARRANGE ---
      departmentsDb.findManyByCompany.mockResolvedValueOnce([
        { id: 'root', name: 'Root', parentId: null, companyId: 'c1' },
        { id: 'child', name: 'Child', parentId: 'root', companyId: 'c1' },
      ]);

      // --- ACT ---
      const tree = await service.listTree();

      // --- ASSERT ---
      expect(departmentsDb.findManyByCompany).toHaveBeenCalledWith('c1');
      expect(tree).toHaveLength(1);
      expect(tree[0].id).toBe('root');
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children[0].id).toBe('child');
    });
  });

  describe('create', () => {
    it('should create a root department without parent lookup', async () => {
      // --- ARRANGE ---
      departmentsDb.create.mockResolvedValueOnce({ id: 'd1' });

      // --- ACT ---
      await service.create({ name: 'Eng', parentId: null });

      // --- ASSERT ---
      expect(departmentsDb.findByIdInCompany).not.toHaveBeenCalled();
      expect(departmentsDb.create).toHaveBeenCalledWith({
        companyId: 'c1',
        parentId: null,
        name: 'Eng',
      });
    });

    it('should default parentId to null when omitted from the DTO', async () => {
      // --- ARRANGE --- Zod allows `parentId` to be absent (optional).
      departmentsDb.create.mockResolvedValueOnce({ id: 'd2' });

      // --- ACT ---
      await service.create({ name: 'Marketing' } as any);

      // --- ASSERT ---
      expect(departmentsDb.findByIdInCompany).not.toHaveBeenCalled();
      expect(departmentsDb.create).toHaveBeenCalledWith({
        companyId: 'c1',
        parentId: null,
        name: 'Marketing',
      });
    });

    it('should throw DAT0009 when parentId is not in the caller company', async () => {
      // --- ARRANGE --- findByIdInCompany returns null for cross-tenant parent.
      departmentsDb.findByIdInCompany.mockResolvedValueOnce(null);

      // --- ACT + ASSERT ---
      const err = await service
        .create({ name: 'Sub', parentId: 'other-tenant-dept' })
        .catch(e => e);
      expect(err).toBeInstanceOf(ErrorException);
      expect(err.code).toBe(DAT.DEPARTMENT_NOT_FOUND.code);
      expect(departmentsDb.findByIdInCompany).toHaveBeenCalledWith('other-tenant-dept', 'c1');
      expect(departmentsDb.create).not.toHaveBeenCalled();
    });

    it('should create a child department when the parent is same-company', async () => {
      // --- ARRANGE ---
      departmentsDb.findByIdInCompany.mockResolvedValueOnce({ id: 'parent', companyId: 'c1' });
      departmentsDb.create.mockResolvedValueOnce({ id: 'child' });

      // --- ACT ---
      await service.create({ name: 'Sub', parentId: 'parent' });

      // --- ASSERT ---
      expect(departmentsDb.findByIdInCompany).toHaveBeenCalledWith('parent', 'c1');
      expect(departmentsDb.create).toHaveBeenCalledWith({
        companyId: 'c1',
        parentId: 'parent',
        name: 'Sub',
      });
    });
  });
});

describe('buildTree', () => {
  it('should handle a 3-level tree', () => {
    // --- ARRANGE ---
    const flat = [
      { id: 'a', name: 'A', parentId: null, companyId: 'c1' } as any,
      { id: 'b', name: 'B', parentId: 'a', companyId: 'c1' } as any,
      { id: 'c', name: 'C', parentId: 'b', companyId: 'c1' } as any,
    ];

    // --- ACT ---
    const tree = buildTree(flat);

    // --- ASSERT ---
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('a');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].id).toBe('b');
    expect(tree[0].children[0].children[0].id).toBe('c');
  });

  it('should treat orphan parent references as roots', () => {
    // --- ARRANGE --- parentId 'ghost' is NOT in the set.
    const flat = [{ id: 'x', name: 'X', parentId: 'ghost', companyId: 'c1' } as any];

    // --- ACT ---
    const tree = buildTree(flat);

    // --- ASSERT ---
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('x');
    expect(tree[0].parentId).toBe('ghost');
  });

  it('should return an empty tree for an empty input', () => {
    // --- ACT ---
    const tree = buildTree([]);

    // --- ASSERT ---
    expect(tree).toEqual([]);
  });

  it('should attach multiple children under the same parent', () => {
    // --- ARRANGE ---
    const flat = [
      { id: 'r', name: 'R', parentId: null, companyId: 'c1' } as any,
      { id: 'c1', name: 'C1', parentId: 'r', companyId: 'c1' } as any,
      { id: 'c2', name: 'C2', parentId: 'r', companyId: 'c1' } as any,
    ];

    // --- ACT ---
    const tree = buildTree(flat);

    // --- ASSERT ---
    expect(tree).toHaveLength(1);
    const childIds = tree[0].children.map(c => c.id).sort();
    expect(childIds).toEqual(['c1', 'c2']);
  });
});
