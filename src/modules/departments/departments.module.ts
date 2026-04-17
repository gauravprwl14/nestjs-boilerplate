import { Module } from '@nestjs/common';
import { DepartmentsController } from './departments.controller';
import { DepartmentsService } from './departments.service';

/**
 * Departments feature module. DepartmentsDbService is exported by the global
 * DatabaseModule — no explicit import needed here.
 */
@Module({
  controllers: [DepartmentsController],
  providers: [DepartmentsService],
})
export class DepartmentsModule {}
