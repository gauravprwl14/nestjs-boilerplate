import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { createHmac } from 'crypto';
import { AppConfigService } from '@config/config.service';
import { AppLogger } from '@logger/logger.service';
import { LogLevel } from '@logger/logger.interfaces';

/** Header name for HMAC signature */
const SIGNATURE_HEADER = 'x-signature';

/** Header name for timestamp (replay attack prevention) */
const TIMESTAMP_HEADER = 'x-timestamp';

/** Maximum age of a request signature in milliseconds (5 minutes) */
const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;

/**
 * Verifies HMAC-SHA256 request signatures for webhook or inter-service communication.
 *
 * The signature is computed as: HMAC-SHA256(secret, timestamp + '.' + rawBody)
 * Both x-signature and x-timestamp headers are required.
 * Requests older than MAX_SIGNATURE_AGE_MS are rejected to prevent replay attacks.
 *
 * This middleware should be applied selectively to webhook routes, not globally.
 *
 * @example
 * ```typescript
 * // In a module's configure method:
 * consumer.apply(SignatureVerificationMiddleware).forRoutes('webhooks');
 * ```
 */
@Injectable()
export class SignatureVerificationMiddleware implements NestMiddleware {
  constructor(
    private readonly config: AppConfigService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(SignatureVerificationMiddleware.name);
  }

  /**
   * Validates the HMAC-SHA256 signature and timestamp headers on the incoming request.
   * Responds with 401 if headers are missing, expired, or the signature is invalid.
   *
   * @param req  - Incoming Express request
   * @param res  - Express response (used to send 401 on failure)
   * @param next - Call to proceed to the next middleware if validation passes
   */
  use(req: Request, res: Response, next: NextFunction): void {
    const signature = req.headers[SIGNATURE_HEADER] as string | undefined;
    const timestamp = req.headers[TIMESTAMP_HEADER] as string | undefined;

    if (!signature || !timestamp) {
      this.logger.log('signature.missing', {
        level: LogLevel.WARN,
        attributes: {
          'http.method': req.method,
          'http.url': req.url,
          hasSignature: String(!!signature),
          hasTimestamp: String(!!timestamp),
        },
      });
      res.status(401).json({
        success: false,
        errors: [{ code: 'AUT0001', message: 'Signature headers required' }],
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Replay attack prevention: reject requests older than MAX_SIGNATURE_AGE_MS
    const requestTime = parseInt(timestamp, 10);
    const now = Date.now();
    if (isNaN(requestTime) || Math.abs(now - requestTime) > MAX_SIGNATURE_AGE_MS) {
      this.logger.log('signature.expired', {
        level: LogLevel.WARN,
        attributes: { 'http.url': req.url, ageDelta: String(Math.abs(now - requestTime)) },
      });
      res.status(401).json({
        success: false,
        errors: [{ code: 'AUT0002', message: 'Request signature expired' }],
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Compute expected signature using raw body if available, otherwise serialise body
    const rawBody = (req as any).rawBody ?? JSON.stringify(req.body);
    const payload = `${timestamp}.${rawBody}`;
    const secret = this.config.auth.apiKeyEncryptionSecret;
    const expectedSignature = createHmac('sha256', secret).update(payload).digest('hex');

    if (signature !== expectedSignature) {
      this.logger.log('signature.invalid', {
        level: LogLevel.WARN,
        attributes: { 'http.url': req.url },
      });
      res.status(401).json({
        success: false,
        errors: [{ code: 'AUT0003', message: 'Invalid request signature' }],
        timestamp: new Date().toISOString(),
      });
      return;
    }

    next();
  }
}
