import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';

/**
 * Swagger metadata for `POST /api/v1/departments`.
 */
export const CreateDepartmentSwagger = () =>
  applyDecorators(
    ApiOperation({ summary: "Create a department in the caller's company." }),
    ApiBody({
      description:
        "`parentId` may be omitted/null for a root department. If provided, the parent must belong to the caller's company (cross-tenant parents fail with DAT0009).",
      schema: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 120, example: 'Engineering' },
          parentId: {
            type: 'string',
            format: 'uuid',
            nullable: true,
            description: 'Parent department id (same-company) or null for a root.',
          },
        },
      },
      examples: {
        root: {
          summary: 'Root department',
          value: { name: 'Engineering', parentId: null },
        },
        child: {
          summary: 'Child department under an existing parent',
          value: { name: 'Engineering · Backend', parentId: '<engineering-department-uuid>' },
        },
      },
    }),
    ApiResponse({ status: HttpStatus.CREATED, description: 'Department created.' }),
    ApiResponse({
      status: HttpStatus.BAD_REQUEST,
      description: 'Invalid input or cross-tenant parent (DAT0009).',
    }),
    ApiResponse({
      status: HttpStatus.UNAUTHORIZED,
      description: 'Missing or unknown `x-user-id` header.',
    }),
  );

/** Swagger metadata for `GET /api/v1/departments` (flat list). */
export const ListDepartmentsSwagger = () =>
  applyDecorators(
    ApiOperation({ summary: "List all departments in the caller's company (flat)." }),
    ApiResponse({ status: HttpStatus.OK, description: 'Flat department list.' }),
  );

/** Swagger metadata for `GET /api/v1/departments/tree`. */
export const DepartmentTreeSwagger = () =>
  applyDecorators(
    ApiOperation({ summary: 'Return the department hierarchy as a nested tree.' }),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'Nested tree of departments, roots first.',
    }),
  );
