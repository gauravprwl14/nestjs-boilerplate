import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '@database/prisma.module';
import { MultiDbService } from '@database/multi-db.service';
import { ArchiveRegistryService } from '@database/archive-registry.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [MultiDbService, ArchiveRegistryService],
  exports: [MultiDbService, ArchiveRegistryService],
})
export class DatabaseModule {}
