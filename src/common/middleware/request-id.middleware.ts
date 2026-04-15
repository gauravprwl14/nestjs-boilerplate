import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ClsService } from 'nestjs-cls';
import { REQUEST_ID_HEADER } from '@common/constants';
import { ClsKey } from '@common/cls/cls.constants';

/**
 * Middleware that ensures every request carries a unique request ID.
 *
 * - Extracts an existing ID from the `x-request-id` header if present.
 * - Generates a new UUID v4 otherwise.
 * - Attaches the ID to `req.id` and echoes it back in the response header.
 * - Stores the request ID in CLS for access anywhere in the request chain.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  constructor(private readonly cls: ClsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const existingId = req.headers[REQUEST_ID_HEADER];
    const requestId = (Array.isArray(existingId) ? existingId[0] : existingId) ?? uuidv4();

    (req as Request & { id: string }).id = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);

    // Store in CLS for access anywhere in the request chain
    this.cls.set(ClsKey.REQUEST_ID, requestId);

    next();
  }
}
