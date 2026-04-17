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

    const companyId = this.cls.get<string | undefined>(ClsKey.COMPANY_ID);
    if (!companyId) {
      throw new ErrorException(AUT.UNAUTHENTICATED, {
        message: 'No tenant context on this request — mock auth middleware did not run.',
      });
    }
    return true;
  }
}
