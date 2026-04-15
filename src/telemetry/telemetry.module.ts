import { Global, Module } from '@nestjs/common';
import { TelemetryService } from './telemetry.service';

/**
 * Global telemetry module.
 *
 * Marked `@Global` so `TelemetryService` is available across all feature
 * modules without needing to re-import this module everywhere.
 *
 * The OTel SDK itself is initialised in `main.ts` via `initOtelSdk()` before
 * NestFactory.create — this module only provides the injectable wrapper.
 */
@Global()
@Module({
  providers: [TelemetryService],
  exports: [TelemetryService],
})
export class TelemetryModule {}
