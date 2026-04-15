import { applyDecorators, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

/**
 * Composite decorator for API endpoints.
 * Combines @ApiOperation, @ApiResponse, and @HttpCode into a single decorator,
 * reducing boilerplate on controller methods and enforcing consistent response
 * documentation.
 *
 * @example
 * ```typescript
 * @Get()
 * @ApiEndpoint({
 *   summary: 'Get all todo lists',
 *   successStatus: HttpStatus.OK,
 *   successDescription: 'Todo lists returned',
 *   errorResponses: [HttpStatus.UNAUTHORIZED, HttpStatus.TOO_MANY_REQUESTS],
 * })
 * async findAll() {}
 *
 * @Post()
 * @ApiEndpoint({
 *   summary: 'Create a todo list',
 *   successStatus: HttpStatus.CREATED,
 *   successDescription: 'Todo list created',
 *   errorResponses: [HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED],
 * })
 * async create() {}
 * ```
 */
export function ApiEndpoint(options: {
  /** Short summary shown in the Swagger UI operation heading. */
  summary: string;
  /** Optional longer description shown in the expanded operation panel. */
  description?: string;
  /** HTTP status code for the success response. Defaults to 200 (OK). */
  successStatus?: HttpStatus;
  /** Description text for the success response. Defaults to 'Success'. */
  successDescription?: string;
  /** List of HTTP error status codes to document on this endpoint. */
  errorResponses?: HttpStatus[];
}): MethodDecorator {
  const {
    summary,
    description,
    successStatus = HttpStatus.OK,
    successDescription = 'Success',
    errorResponses = [],
  } = options;

  const decorators: MethodDecorator[] = [
    ApiOperation({ summary, description }),
    ApiResponse({ status: successStatus, description: successDescription }),
    HttpCode(successStatus),
  ];

  /** Maps common HTTP error status codes to human-readable descriptions. */
  const errorDescriptions: Record<number, string> = {
    [HttpStatus.BAD_REQUEST]: 'Validation error',
    [HttpStatus.UNAUTHORIZED]: 'Authentication required',
    [HttpStatus.FORBIDDEN]: 'Access forbidden',
    [HttpStatus.NOT_FOUND]: 'Resource not found',
    [HttpStatus.CONFLICT]: 'Resource conflict',
    [HttpStatus.TOO_MANY_REQUESTS]: 'Rate limit exceeded',
    [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal server error',
  };

  for (const status of errorResponses) {
    decorators.push(
      ApiResponse({
        status,
        description: errorDescriptions[status] ?? `Error ${status}`,
      }),
    );
  }

  return applyDecorators(...decorators);
}
