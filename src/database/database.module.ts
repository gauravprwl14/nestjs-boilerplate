import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '@database/prisma.module';
import { DatabaseService } from '@database/database.service';
import { UsersDbRepository } from '@database/users/users.db-repository';
import { UsersDbService } from '@database/users/users.db-service';
import { AuthCredentialsDbRepository } from '@database/auth-credentials/auth-credentials.db-repository';
import { AuthCredentialsDbService } from '@database/auth-credentials/auth-credentials.db-service';
import { TodoListsDbRepository } from '@database/todo-lists/todo-lists.db-repository';
import { TodoListsDbService } from '@database/todo-lists/todo-lists.db-service';
import { TodoItemsDbRepository } from '@database/todo-items/todo-items.db-repository';
import { TodoItemsDbService } from '@database/todo-items/todo-items.db-service';
import { TagsDbRepository } from '@database/tags/tags.db-repository';
import { TagsDbService } from '@database/tags/tags.db-service';

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
    AuthCredentialsDbRepository,
    AuthCredentialsDbService,
    TodoListsDbRepository,
    TodoListsDbService,
    TodoItemsDbRepository,
    TodoItemsDbService,
    TagsDbRepository,
    TagsDbService,
  ],
  exports: [
    DatabaseService,
    UsersDbService,
    AuthCredentialsDbService,
    TodoListsDbService,
    TodoItemsDbService,
    TagsDbService,
  ],
})
export class DatabaseModule {}
