import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { MAX_TWEET_CONTENT_LENGTH } from '@common/constants';

/**
 * Swagger metadata for `POST /api/v1/tweets`.
 *
 * Kept out of the controller to keep the routing code scannable — the controller
 * method stays a one-liner that delegates to the service.
 */
export const CreateTweetSwagger = () =>
  applyDecorators(
    ApiOperation({ summary: "Create a tweet (scoped to the caller's company)." }),
    ApiBody({
      description:
        "Tweet content (≤ 280 chars) and visibility. `departmentIds` is required for DEPARTMENTS and DEPARTMENTS_AND_SUBDEPARTMENTS visibility and must be uuids from the caller's company.",
      schema: {
        type: 'object',
        required: ['content', 'visibility'],
        properties: {
          content: {
            type: 'string',
            minLength: 1,
            maxLength: MAX_TWEET_CONTENT_LENGTH,
            example: 'Hello world',
          },
          visibility: {
            type: 'string',
            enum: ['COMPANY', 'DEPARTMENTS', 'DEPARTMENTS_AND_SUBDEPARTMENTS'],
          },
          departmentIds: {
            type: 'array',
            items: { type: 'string', format: 'uuid' },
            description:
              'Required for DEPARTMENTS / DEPARTMENTS_AND_SUBDEPARTMENTS; omit for COMPANY.',
          },
        },
      },
      examples: {
        company: {
          summary: 'COMPANY — everyone in the tenant sees it',
          value: { content: 'Welcome to the team!', visibility: 'COMPANY' },
        },
        departments: {
          summary: 'DEPARTMENTS — only listed depts (direct members)',
          value: {
            content: 'Sales team: commission structure updated.',
            visibility: 'DEPARTMENTS',
            departmentIds: ['<sales-department-uuid>'],
          },
        },
        deptAndSubdepts: {
          summary: 'DEPARTMENTS_AND_SUBDEPARTMENTS — listed depts + subtrees',
          value: {
            content: 'Engineering: refactoring sprint starts Wednesday.',
            visibility: 'DEPARTMENTS_AND_SUBDEPARTMENTS',
            departmentIds: ['<engineering-department-uuid>'],
          },
        },
      },
    }),
    ApiResponse({ status: HttpStatus.CREATED, description: 'Tweet created.' }),
    ApiResponse({
      status: HttpStatus.BAD_REQUEST,
      description: 'Invalid visibility payload or cross-tenant department reference.',
    }),
    ApiResponse({
      status: HttpStatus.UNAUTHORIZED,
      description: 'Missing or unknown `x-user-id` header.',
    }),
  );

/**
 * Swagger metadata for `GET /api/v1/timeline`.
 */
export const GetTimelineSwagger = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Return tweets visible to the caller, newest first.',
      description:
        'Visibility rules (COMPANY / DEPARTMENTS / DEPARTMENTS_AND_SUBDEPARTMENTS) are resolved in a single recursive-CTE SQL query. The caller ALWAYS sees their own tweets regardless of target audience (guards against the "ghost tweet" UX bug).',
    }),
    ApiResponse({ status: HttpStatus.OK, description: 'Timeline rows (up to 100).' }),
    ApiResponse({
      status: HttpStatus.UNAUTHORIZED,
      description: 'Missing or unknown `x-user-id` header.',
    }),
  );
