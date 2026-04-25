import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '@database/prisma.module';
import { MultiDbService } from '@database/multi-db.service';
import { ArchiveRegistryService } from '@database/archive-registry.service';
import { OrdersDbRepository } from '@database/orders/orders.db-repository';
import { OrdersDbService } from '@database/orders/orders.db-service';
import { ArchivalDbRepository } from '@database/archival/archival.db-repository';
import { ArchivalDbService } from '@database/archival/archival.db-service';
import { MockDataDbRepository } from '@database/mock-data/mock-data.db-repository';
import { MockDataDbService } from '@database/mock-data/mock-data.db-service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    MultiDbService,
    ArchiveRegistryService,
    OrdersDbRepository,
    OrdersDbService,
    ArchivalDbRepository,
    ArchivalDbService,
    MockDataDbRepository,
    MockDataDbService,
  ],
  exports: [
    MultiDbService,
    ArchiveRegistryService,
    OrdersDbService,
    ArchivalDbService,
    MockDataDbService,
  ],
})
export class DatabaseModule {}
