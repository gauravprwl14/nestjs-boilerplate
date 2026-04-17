import { Injectable } from '@nestjs/common';
import { Prisma, Department } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { BaseRepository } from '@database/base.repository';
import { DbTransactionClient } from '@database/types';
import { InstrumentClass } from '@telemetry/decorators/instrument-class.decorator';

/**
 * Repository for the Department model. Only file outside src/database that
 * touches Prisma's department delegate. All reads/writes flow through the
 * tenant-scope Prisma extension: either via the extended root client
 * (`prisma.tenantScoped`) or via a transaction client started from it.
 */
@InstrumentClass()
@Injectable()
export class DepartmentsDbRepository extends BaseRepository<
  Department,
  Prisma.DepartmentCreateInput,
  Prisma.DepartmentUpdateInput,
  Prisma.DepartmentWhereUniqueInput,
  Prisma.DepartmentWhereInput,
  Prisma.DepartmentOrderByWithRelationInput
> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  /** Tenant-scoped repos route `client.department` through the extended client. */
  protected delegateFor(client: PrismaService | DbTransactionClient) {
    if (client === this.prisma) {
      return (this.prisma.tenantScoped as unknown as { department: Prisma.DepartmentDelegate })
        .department;
    }
    return (client as DbTransactionClient).department;
  }

  /**
   * Lists every department in the caller's company (ordered by name).
   * The tenant-scope extension injects the companyId filter automatically; we
   * pass `companyId` explicitly too so the query is self-documenting.
   */
  async findManyByCompany(companyId: string, tx?: DbTransactionClient): Promise<Department[]> {
    const delegate = this.delegateFor(this.client(tx));
    return delegate.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Finds one department by id. Tenant-scope extension silently returns null
   * for cross-tenant ids — but we also pass companyId explicitly for clarity.
   */
  async findByIdInCompany(
    id: string,
    companyId: string,
    tx?: DbTransactionClient,
  ): Promise<Department | null> {
    const delegate = this.delegateFor(this.client(tx));
    return delegate.findFirst({ where: { id, companyId } });
  }

  /**
   * Returns the subset of requested ids that exist in this company.
   * Used by services to pre-validate department references before a pivot write.
   */
  async findExistingIdsInCompany(
    ids: string[],
    companyId: string,
    tx?: DbTransactionClient,
  ): Promise<string[]> {
    if (ids.length === 0) return [];
    const delegate = this.delegateFor(this.client(tx));
    const rows = await delegate.findMany({
      where: { id: { in: ids }, companyId },
      select: { id: true },
    } as unknown as { where: Prisma.DepartmentWhereInput });
    return (rows as unknown as Array<{ id: string }>).map(r => r.id);
  }

  /**
   * Creates a new department. The tenant-scope extension asserts that
   * `companyId` matches the caller's CLS companyId.
   */
  async createDepartment(
    input: { companyId: string; parentId: string | null; name: string },
    tx?: DbTransactionClient,
  ): Promise<Department> {
    const delegate = this.delegateFor(this.client(tx));
    return delegate.create({
      data: {
        companyId: input.companyId,
        parentId: input.parentId,
        name: input.name,
      },
    } as unknown as { data: Prisma.DepartmentCreateInput });
  }
}
