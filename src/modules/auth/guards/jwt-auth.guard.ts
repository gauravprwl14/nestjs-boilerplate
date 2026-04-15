import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '@common/constants';
import { ErrorFactory } from '@errors/types/error-factory';

/**
 * JWT authentication guard.
 *
 * Extends the Passport JWT AuthGuard with:
 * - Public route bypass via the @Public() decorator
 * - Consistent error mapping to domain ErrorException instances
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  /**
   * Allows the request if the route is marked @Public(), otherwise delegates
   * to the Passport JWT strategy for token validation.
   */
  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  /**
   * Maps Passport / JWT errors to domain-specific ErrorException instances.
   */
  handleRequest<TUser = unknown>(err: unknown, user: TUser, info: unknown): TUser {
    if (err || !user) {
      const infoMessage = info instanceof Error ? info.message : String(info ?? '');

      if (infoMessage.toLowerCase().includes('expired')) {
        throw ErrorFactory.tokenExpired();
      }

      throw ErrorFactory.tokenInvalid();
    }

    return user;
  }
}
