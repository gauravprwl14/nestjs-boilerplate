import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '@database/prisma.module';
import { DatabaseService } from '@database/database.service';
import { UsersDbRepository } from '@database/users/users.db-repository';
import { UsersDbService } from '@database/users/users.db-service';
import { CompaniesDbRepository } from '@database/companies/companies.db-repository';
import { CompaniesDbService } from '@database/companies/companies.db-service';
import { DepartmentsDbRepository } from '@database/departments/departments.db-repository';
import { DepartmentsDbService } from '@database/departments/departments.db-service';
import { TweetsDbRepository } from '@database/tweets/tweets.db-repository';
import { TweetsDbService } from '@database/tweets/tweets.db-service';

/**
 * Global database module. Aggregates every per-entity DbService + DbRepository
 * and exposes the transaction boundary. Feature modules inject the DbServices
 * without needing to import this module.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    DatabaseService,
    UsersDbRepository,
    UsersDbService,
    CompaniesDbRepository,
    CompaniesDbService,
    DepartmentsDbRepository,
    DepartmentsDbService,
    TweetsDbRepository,
    TweetsDbService,
  ],
  exports: [
    DatabaseService,
    UsersDbService,
    CompaniesDbService,
    DepartmentsDbService,
    TweetsDbService,
  ],
})
export class DatabaseModule {}
