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
 * @Get('timeline')
 * @ApiEndpoint({
 *   summary: 'Get the caller\'s tweet timeline',
 *   description: 'Returns tweets visible to the caller based on company and department membership.',
 *   successStatus: HttpStatus.OK,
 *   successDescription: 'Timeline returned',
 *   errorResponses: [HttpStatus.UNAUTHORIZED],
 * })
 * async timeline() {}
 *
 * @Post('tweets')
 * @ApiEndpoint({
 *   summary: 'Create a tweet',
 *   successStatus: HttpStatus.CREATED,
 *   successDescription: 'Tweet created',
 *   errorResponses: [HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN],
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
