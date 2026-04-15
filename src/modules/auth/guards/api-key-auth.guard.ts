import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard that validates requests using an API key from the configured header.
 * Delegates to the 'api-key' Passport custom strategy.
 */
@Injectable()
export class ApiKeyAuthGuard extends AuthGuard('api-key') {}
