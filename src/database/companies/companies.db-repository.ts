import { Injectable } from '@nestjs/common';
import { Prisma, Company } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { BaseRepository } from '@database/base.repository';
import { DbTransactionClient } from '@database/types';

/**
 * Repository for the Company model. Only file outside src/database that
 * touches Prisma's company delegate.
 */
@Injectable()
export class CompaniesDbRepository extends BaseRepository<
  Company,
  Prisma.CompanyCreateInput,
  Prisma.CompanyUpdateInput,
  Prisma.CompanyWhereUniqueInput,
  Prisma.CompanyWhereInput,
  Prisma.CompanyOrderByWithRelationInput
> {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  protected delegateFor(client: PrismaService | DbTransactionClient) {
    return client.company;
  }

  /**
   * Finds a company by id. Company is NOT tenant-scoped (it IS the tenant),
   * so reads happen with the extension bypass.
   *
   * @param id - Company UUID
   * @param tx - Optional transaction client
   * @returns The company or null
   */
  async findById(id: string, tx?: DbTransactionClient): Promise<Company | null> {
    return this.client(tx).company.findUnique({ where: { id } });
  }
}
