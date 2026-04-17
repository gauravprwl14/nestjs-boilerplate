import { DepartmentsService, buildTree } from '@modules/departments/departments.service';
import { ClsKey } from '@common/cls/cls.constants';
import { ErrorException } from '@errors/types/error-exception';

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
    it('returns departments scoped to caller company', async () => {
      // Arrange
      const rows = [{ id: 'd1', name: 'A', companyId: 'c1', parentId: null }];
      departmentsDb.findManyByCompany.mockResolvedValueOnce(rows);
      // Act
      const result = await service.list();
      // Assert
      expect(result).toBe(rows);
      expect(departmentsDb.findManyByCompany).toHaveBeenCalledWith('c1');
    });
  });

  describe('create', () => {
    it('creates a root department without parent lookup', async () => {
      // Arrange
      departmentsDb.create.mockResolvedValueOnce({ id: 'd1' });
      // Act
      await service.create({ name: 'Eng', parentId: null });
      // Assert
      expect(departmentsDb.findByIdInCompany).not.toHaveBeenCalled();
      expect(departmentsDb.create).toHaveBeenCalledWith({
        companyId: 'c1',
        parentId: null,
        name: 'Eng',
      });
    });

    it('throws DAT0009 when parentId is missing or cross-tenant', async () => {
      // Arrange — findByIdInCompany returns null for cross-tenant parent.
      departmentsDb.findByIdInCompany.mockResolvedValueOnce(null);
      // Act + Assert
      await expect(
        service.create({ name: 'Sub', parentId: 'other-tenant-dept' }),
      ).rejects.toBeInstanceOf(ErrorException);
      expect(departmentsDb.create).not.toHaveBeenCalled();
    });

    it('creates a child department when parent is same-company', async () => {
      // Arrange
      departmentsDb.findByIdInCompany.mockResolvedValueOnce({ id: 'parent', companyId: 'c1' });
      departmentsDb.create.mockResolvedValueOnce({ id: 'child' });
      // Act
      await service.create({ name: 'Sub', parentId: 'parent' });
      // Assert
      expect(departmentsDb.create).toHaveBeenCalledWith({
        companyId: 'c1',
        parentId: 'parent',
        name: 'Sub',
      });
    });
  });
});

describe('buildTree', () => {
  it('handles a 3-level tree', () => {
    // Arrange
    const flat = [
      { id: 'a', name: 'A', parentId: null, companyId: 'c1' } as any,
      { id: 'b', name: 'B', parentId: 'a', companyId: 'c1' } as any,
      { id: 'c', name: 'C', parentId: 'b', companyId: 'c1' } as any,
    ];
    // Act
    const tree = buildTree(flat);
    // Assert
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('a');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].id).toBe('b');
    expect(tree[0].children[0].children[0].id).toBe('c');
  });

  it('treats orphan parent references as roots', () => {
    // Arrange: parentId 'ghost' is NOT in the set
    const flat = [{ id: 'x', name: 'X', parentId: 'ghost', companyId: 'c1' } as any];
    // Act
    const tree = buildTree(flat);
    // Assert
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('x');
  });
});
