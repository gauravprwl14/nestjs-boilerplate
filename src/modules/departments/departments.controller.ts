import { Body, Controller, Get, HttpCode, HttpStatus, Post, UsePipes } from '@nestjs/common';
import { ApiTags, ApiSecurity } from '@nestjs/swagger';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';
import { Trace } from '@telemetry/decorators/trace.decorator';
import { DepartmentsService, DepartmentTreeNode } from './departments.service';
import { CreateDepartmentDto, CreateDepartmentSchema } from './dto/create-department.dto';
import {
  CreateDepartmentSwagger,
  ListDepartmentsSwagger,
  DepartmentTreeSwagger,
} from './departments.swagger';
import { Department } from '@prisma/client';

/**
 * HTTP surface for the Department aggregate. Swagger metadata lives in
 * `departments.swagger.ts`; validation schema in `dto/create-department.dto.ts`;
 * business logic (including the same-tenant parent check) in
 * `departments.service.ts`.
 */
@ApiTags('Departments')
@ApiSecurity('x-user-id')
@Controller({ path: 'departments', version: '1' })
export class DepartmentsController {
  constructor(private readonly service: DepartmentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(CreateDepartmentSchema))
  @CreateDepartmentSwagger()
  @Trace({ spanName: 'departments.create' })
  async create(@Body() dto: CreateDepartmentDto): Promise<Department> {
    return this.service.create(dto);
  }

  @Get()
  @ListDepartmentsSwagger()
  @Trace({ spanName: 'departments.list' })
  async list(): Promise<Department[]> {
    return this.service.list();
  }

  @Get('tree')
  @DepartmentTreeSwagger()
  @Trace({ spanName: 'departments.tree' })
  async tree(): Promise<DepartmentTreeNode[]> {
    return this.service.listTree();
  }
}
