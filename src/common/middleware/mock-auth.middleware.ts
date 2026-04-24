import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ClsService } from 'nestjs-cls';
import { ClsKey } from '@common/cls/cls.constants';
import { USER_ID_HEADER } from '@common/constants';
import { ErrorException } from '@errors/types/error-exception';
import { AUT } from '@errors/error-codes';

/**
 * Mock authentication middleware.
 *
 * Reads `x-user-id` (positive integer 1–10000) from the request header and
 * stores it in CLS. No DB lookup — intentionally simple for the order
 * management assignment.
 */
@Injectable()
export class MockAuthMiddleware implements NestMiddleware {
  constructor(private readonly cls: ClsService) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    if (!req.originalUrl.startsWith('/api')) {
      return next();
    }

    const rawUserId = req.headers[USER_ID_HEADER] as string | undefined;
    if (!rawUserId) {
      throw new ErrorException(AUT.UNAUTHENTICATED, {
        message: 'Missing x-user-id header',
      });
    }

    const userId = parseInt(rawUserId, 10);
    if (isNaN(userId) || userId <= 0) {
      throw new ErrorException(AUT.UNAUTHENTICATED, {
        message: 'x-user-id must be a positive integer',
      });
    }

    this.cls.set(ClsKey.USER_ID, userId);
    next();
  }
}
