import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '@database/prisma.module';
import { DatabaseService } from '@database/database.service';
import { UsersDbRepository } from '@database/users/users.db-repository';
import { UsersDbService } from '@database/users/users.db-service';

/**
 * Global database module. Aggregates every per-entity DbService + DbRepository
 * and exposes the transaction boundary. Feature modules inject the DbServices
 * without needing to import this module.
 *
 * Per-aggregate providers (users, auth-credentials, todo-lists, todo-items,
 * tags) are added in later tasks.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [DatabaseService, UsersDbRepository, UsersDbService],
  exports: [DatabaseService, UsersDbService],
})
export class DatabaseModule {}
