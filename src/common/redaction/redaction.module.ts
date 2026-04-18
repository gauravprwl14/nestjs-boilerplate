import { Global, Module } from '@nestjs/common';

import { RedactorService } from './redactor.service';

/**
 * Global PII-redaction module.
 *
 * {@link RedactorService} is exported so logger, filters, and telemetry
 * wiring can depend on it without re-importing this module everywhere.
 * Registered once in {@link AppModule}.
 */
@Global()
@Module({
  providers: [RedactorService],
  exports: [RedactorService],
})
export class RedactionModule {}
