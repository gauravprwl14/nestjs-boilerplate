import { Injectable } from '@nestjs/common';
import { Department } from '@prisma/client';
import { DepartmentsDbRepository } from './departments.db-repository';
import { DbTransactionClient } from '@database/types';
import { InstrumentClass } from '@telemetry/decorators/instrument-class.decorator';

/**
 * Public DB surface for the Department aggregate.
 */
@InstrumentClass()
@Injectable()
export class DepartmentsDbService {
  constructor(private readonly repo: DepartmentsDbRepository) {}

  /** Lists every department in a company, alphabetical. */
  async findManyByCompany(companyId: string, tx?: DbTransactionClient): Promise<Department[]> {
    return this.repo.findManyByCompany(companyId, tx);
  }

  /** Finds one department by id within a company; null when cross-tenant or absent. */
  async findByIdInCompany(
    id: string,
    companyId: string,
    tx?: DbTransactionClient,
  ): Promise<Department | null> {
    return this.repo.findByIdInCompany(id, companyId, tx);
  }

  /**
   * Returns the ids (from the requested set) that actually exist in this company.
   * Length mismatch vs. the input = caller referenced cross-tenant or unknown ids.
   */
  async findExistingIdsInCompany(
    ids: string[],
    companyId: string,
    tx?: DbTransactionClient,
  ): Promise<string[]> {
    return this.repo.findExistingIdsInCompany(ids, companyId, tx);
  }

  /**
   * Creates a department. Service-layer callers MUST validate `parentId`
   * belongs to `companyId` before calling this — the schema's composite FK
   * is the DB-level backstop, but throwing a named error is friendlier.
   */
  async create(
    input: { companyId: string; parentId: string | null; name: string },
    tx?: DbTransactionClient,
  ): Promise<Department> {
    return this.repo.createDepartment(input, tx);
  }
}
