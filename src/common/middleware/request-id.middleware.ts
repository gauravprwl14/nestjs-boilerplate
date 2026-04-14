import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { REQUEST_ID_HEADER } from '@common/constants';

/**
 * Middleware that ensures every request carries a unique request ID.
 *
 * - Extracts an existing ID from the `x-request-id` header if present.
 * - Generates a new UUID v4 otherwise.
 * - Attaches the ID to `req.id` and echoes it back in the response header.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const existingId = req.headers[REQUEST_ID_HEADER];
    const requestId = (Array.isArray(existingId) ? existingId[0] : existingId) ?? uuidv4();

    (req as Request & { id: string }).id = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);

    next();
  }
}
