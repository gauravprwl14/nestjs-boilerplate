/**
 * Global module exporting {@link TracedHttpClient}.
 *
 * Marked `@Global()` so feature modules don't need to re-import — the client
 * is a tiny, stateless helper with a single `RedactorService` dependency,
 * so there's no downside to ambient availability.
 */
import { Global, Module } from '@nestjs/common';

import { TracedHttpClient } from './traced-http-client';

@Global()
@Module({
  providers: [TracedHttpClient],
  exports: [TracedHttpClient],
})
export class TracedHttpClientModule {}
