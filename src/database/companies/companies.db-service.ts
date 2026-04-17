import { Injectable } from '@nestjs/common';
import { Company } from '@prisma/client';
import { CompaniesDbRepository } from './companies.db-repository';
import { DbTransactionClient } from '@database/types';
import { InstrumentClass } from '@telemetry/decorators/instrument-class.decorator';

/**
 * Public DB surface for the Company aggregate.
 * Feature modules inject this service; they never import from '@prisma/client' directly.
 */
@InstrumentClass()
@Injectable()
export class CompaniesDbService {
  constructor(private readonly repo: CompaniesDbRepository) {}

  /**
   * Finds a company by its UUID. Returns null when not found.
   * @param id - Company UUID
   * @param tx - Optional transaction client
   */
  async findById(id: string, tx?: DbTransactionClient): Promise<Company | null> {
    return this.repo.findById(id, tx);
  }
}
