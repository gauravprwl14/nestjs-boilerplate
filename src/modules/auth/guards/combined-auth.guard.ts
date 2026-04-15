import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '@common/constants';
import { ErrorFactory } from '@errors/types/error-factory';

/**
 * Combined authentication guard that tries JWT first, then falls back to API key.
 *
 * Usage: Apply to routes that accept both JWT Bearer tokens and API key headers.
 * @Public() routes are still bypassed.
 */
@Injectable()
export class CombinedAuthGuard implements CanActivate {
  private readonly jwtGuard = AuthGuard('jwt');
  private readonly apiKeyGuard = AuthGuard('api-key');

  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // Try JWT first
    try {
      const jwtInstance = new (this.jwtGuard as new () => CanActivate)();
      const result = await Promise.resolve(jwtInstance.canActivate(context));
      if (result) return true;
    } catch {
      // JWT failed — try API key
    }

    // Try API key
    try {
      const apiKeyInstance = new (this.apiKeyGuard as new () => CanActivate)();
      const result = await Promise.resolve(apiKeyInstance.canActivate(context));
      if (result) return true;
    } catch {
      // API key also failed
    }

    throw ErrorFactory.authentication();
  }
}
