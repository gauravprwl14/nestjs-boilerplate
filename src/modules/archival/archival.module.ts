import { Module } from '@nestjs/common';
import { ArchivalController } from './archival.controller';
import { ArchivalService } from './archival.service';
import { PartitionRotationService } from './partition-rotation.service';

/**
 * NestJS feature module for archival admin endpoints.
 *
 * `ArchivalDbService` (and the underlying repository) are provided globally
 * by `DatabaseModule` — they do not need to be declared here.
 * Both `ArchivalService` and `PartitionRotationService` are internal to this
 * module and not exported; they are only consumed by `ArchivalController`.
 */
@Module({
  controllers: [ArchivalController],
  providers: [ArchivalService, PartitionRotationService],
})
export class ArchivalModule {}
