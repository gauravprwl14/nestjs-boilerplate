import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';

/**
 * Composite decorator that applies both Bearer token security schema
 * and standard 401 Unauthorized response documentation.
 *
 * @example
 * ```typescript
 * @ApiAuth()
 * @Get('protected')
 * protectedRoute() {}
 * ```
 */
export const ApiAuth = () =>
  applyDecorators(
    ApiBearerAuth('jwt'),
    ApiUnauthorizedResponse({ description: 'Unauthorized' }),
  );
