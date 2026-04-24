import { Module } from '@nestjs/common';
import { ArchivalController } from './archival.controller';
import { ArchivalService } from './archival.service';
import { PartitionRotationService } from './partition-rotation.service';

@Module({
  controllers: [ArchivalController],
  providers: [ArchivalService, PartitionRotationService],
})
export class ArchivalModule {}
