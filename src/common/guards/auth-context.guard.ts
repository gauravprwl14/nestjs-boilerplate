import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { ClsKey } from '@common/cls/cls.constants';
import { IS_PUBLIC_KEY } from '@common/constants';
import { ErrorException } from '@errors/types/error-exception';
import { AUT } from '@errors/error-codes';

/**
 * Global fail-fast guard. If the MockAuthMiddleware didn't run for this route
 * (or failed to resolve a tenant), block access before any tenant-scoped query
 * can execute. Routes marked `@Public()` bypass this check.
 *
 * This is belt-and-braces: the middleware alone is sufficient in practice,
 * but a misconfigured middleware scope is a silent risk. The guard exposes
 * it loudly.
 */
@Injectable()
export class AuthContextGuard implements CanActivate {
  constructor(
    private readonly cls: ClsService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const userId = this.cls.get<number | undefined>(ClsKey.USER_ID);
    if (!userId) {
      throw new ErrorException(AUT.UNAUTHENTICATED, {
        message: 'No user context — x-user-id header missing or invalid.',
      });
    }
    return true;
  }
}
