import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ClsService } from 'nestjs-cls';
import { ClsKey } from '@common/cls/cls.constants';
import { USER_ID_HEADER } from '@common/constants';
import { UsersDbService } from '@database/users/users.db-service';
import { ErrorException } from '@errors/types/error-exception';
import { AUT } from '@errors/error-codes';

/**
 * Mock authentication middleware.
 *
 * Reads `x-user-id` from the request. Looks the user up, pulls their company
 * and direct department memberships, and publishes the tuple into CLS so
 * every downstream service (including the Prisma tenant-scope extension) can
 * filter by tenant without manual plumbing.
 *
 * Failures:
 *  - missing header  → AUT.UNAUTHENTICATED
 *  - unknown user id → AUT.UNAUTHENTICATED
 *
 * NOTE: This is intentionally NOT production auth. The assignment explicitly
 * permits mocked auth via header — we take that route to keep the surface
 * small and reviewable.
 */
@Injectable()
export class MockAuthMiddleware implements NestMiddleware {
  constructor(
    private readonly cls: ClsService,
    private readonly usersDb: UsersDbService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    // Only authenticate /api routes. Docs, health probes, and static pages
    // remain anonymous. The global AuthContextGuard also defers to the
    // @Public() decorator for per-route overrides.
    if (!req.originalUrl.startsWith('/api')) {
      return next();
    }

    const header = req.headers[USER_ID_HEADER];
    const userId = Array.isArray(header) ? header[0] : header;
    if (!userId || typeof userId !== 'string' || userId.length === 0) {
      throw new ErrorException(AUT.UNAUTHENTICATED, {
        message: `Missing ${USER_ID_HEADER} header`,
      });
    }

    const auth = await this.usersDb.findAuthContext(userId);
    if (!auth) {
      throw new ErrorException(AUT.UNAUTHENTICATED, {
        message: `Unknown user id: ${userId}`,
      });
    }

    this.cls.set(ClsKey.USER_ID, auth.id);
    this.cls.set(ClsKey.COMPANY_ID, auth.companyId);
    this.cls.set(ClsKey.USER_DEPARTMENT_IDS, auth.departmentIds);

    // Make the resolved user available on the request for param decorators
    // that read `req.user` (e.g., @CurrentUser()).
    (req as Request & { user: typeof auth }).user = auth;

    next();
  }
}
