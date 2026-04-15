import { SetMetadata } from '@nestjs/common';
import { ROLES_KEY } from '@common/constants';

/**
 * Marks a route as accessible only to users with the specified roles.
 * Used in conjunction with RolesGuard.
 *
 * @example
 * ```typescript
 * @Roles('ADMIN')
 * @Get('admin-only')
 * adminRoute() {}
 * ```
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
