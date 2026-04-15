import { Module } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';

/**
 * Global CLS module providing AsyncLocalStorage-based request context.
 * Propagates request-scoped data (requestId, userId, traceId) through
 * the entire async call chain without explicit parameter passing.
 *
 * Mounted as middleware on all routes. Health check routes incur negligible
 * overhead and do not require CLS data, so no exclusions are applied.
 */
@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
      },
    }),
  ],
})
export class AppClsModule {}
