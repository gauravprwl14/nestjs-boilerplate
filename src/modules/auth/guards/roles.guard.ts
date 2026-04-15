import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '@common/constants';
import { ErrorFactory } from '@errors/types/error-factory';

/**
 * Guard that enforces role-based access control.
 *
 * Reads the @Roles() metadata from the handler or class, and checks whether
 * the authenticated user's role is included in the required roles list.
 * If no roles are defined, the guard passes.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw ErrorFactory.authentication();
    }

    if (!requiredRoles.includes(user.role)) {
      throw ErrorFactory.insufficientPermissions();
    }

    return true;
  }
}
