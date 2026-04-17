import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Department } from '@prisma/client';
import { DepartmentsDbService } from '@database/departments/departments.db-service';
import { ClsKey } from '@common/cls/cls.constants';
import { ErrorException } from '@errors/types/error-exception';
import { DAT } from '@errors/error-codes';
import { InstrumentClass } from '@telemetry/decorators/instrument-class.decorator';
import { CreateDepartmentDto } from './dto/create-department.dto';

/** Nested shape returned by `listTree`. */
export interface DepartmentTreeNode {
  id: string;
  name: string;
  parentId: string | null;
  children: DepartmentTreeNode[];
}

/**
 * Business logic for the Department aggregate.
 *
 * All reads are automatically scoped to the caller's company by the tenant-scope
 * Prisma extension; we also pass `companyId` to the db-service methods explicitly
 * as a readability safeguard.
 */
@InstrumentClass()
@Injectable()
export class DepartmentsService {
  constructor(
    private readonly departmentsDb: DepartmentsDbService,
    private readonly cls: ClsService,
  ) {}

  private requireCompanyId(): string {
    const cid = this.cls.get<string | undefined>(ClsKey.COMPANY_ID);
    if (!cid) {
      // AuthContextGuard should have caught this — this branch is defensive.
      throw new ErrorException(DAT.COMPANY_NOT_FOUND, {
        message: 'No company context on this request.',
      });
    }
    return cid;
  }

  /** Lists every department in the caller's company. */
  async list(): Promise<Department[]> {
    return this.departmentsDb.findManyByCompany(this.requireCompanyId());
  }

  /** Returns the company's department tree (roots first, children nested). */
  async listTree(): Promise<DepartmentTreeNode[]> {
    const flat = await this.departmentsDb.findManyByCompany(this.requireCompanyId());
    return buildTree(flat);
  }

  /**
   * Creates a department. If `parentId` is given, we explicitly assert it
   * belongs to the caller's company — a service-layer defense on top of the
   * composite FK and the Prisma extension.
   */
  async create(dto: CreateDepartmentDto): Promise<Department> {
    const companyId = this.requireCompanyId();
    const parentId = dto.parentId ?? null;

    if (parentId) {
      const parent = await this.departmentsDb.findByIdInCompany(parentId, companyId);
      if (!parent) {
        throw new ErrorException(DAT.DEPARTMENT_NOT_FOUND, {
          message: `Parent department ${parentId} not found in this company.`,
        });
      }
    }

    return this.departmentsDb.create({ companyId, parentId, name: dto.name });
  }
}

/**
 * Exported for unit tests. Builds a nested tree from a flat list using a
 * single pass + two iterations. Any department whose parentId is not present
 * in the set is treated as a root.
 */
export function buildTree(flat: Department[]): DepartmentTreeNode[] {
  const byId = new Map<string, DepartmentTreeNode>();
  for (const d of flat) {
    byId.set(d.id, { id: d.id, name: d.name, parentId: d.parentId ?? null, children: [] });
  }
  const roots: DepartmentTreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}
