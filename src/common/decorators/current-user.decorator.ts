import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extracts the current authenticated user (or a specific field) from the request.
 *
 * @example
 * ```typescript
 * // Get full user object
 * async getProfile(@CurrentUser() user: User) {}
 *
 * // Get specific field
 * async getProfile(@CurrentUser('id') userId: string) {}
 * ```
 */
export const CurrentUser = createParamDecorator(
  (field: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    if (!user) return null;
    return field ? user[field] : user;
  },
);
