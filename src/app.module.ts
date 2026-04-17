import { Module, MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppConfigModule } from '@config/config.module';
import { DatabaseModule } from '@database/database.module';
import { AppLoggerModule } from '@logger/logger.module';
import { TelemetryModule } from '@telemetry/telemetry.module';
import { AllExceptionsFilter } from '@common/filters/all-exceptions.filter';
import { RequestIdMiddleware } from '@common/middleware/request-id.middleware';
import { SecurityHeadersMiddleware } from '@common/middleware/security-headers.middleware';
import { MockAuthMiddleware } from '@common/middleware/mock-auth.middleware';
import { AppClsModule } from '@common/cls/cls.module';
import { AuthContextGuard } from '@common/guards/auth-context.guard';
import { DepartmentsModule } from '@modules/departments/departments.module';
import { TweetsModule } from '@modules/tweets/tweets.module';

@Module({
  imports: [
    // CLS must be imported before other modules that use it
    AppClsModule,
    // Core
    AppConfigModule,
    AppLoggerModule,
    // DatabaseModule is @Global() and transitively imports PrismaModule
    DatabaseModule,
    TelemetryModule,
    // Feature modules
    DepartmentsModule,
    TweetsModule,
  ],
  providers: [
    // AllExceptionsFilter registered as a provider for DI resolution in main.ts.
    // The actual global registration happens via useGlobalFilters() in main.ts.
    AllExceptionsFilter,
    // Global fail-fast guard: every request must have companyId in CLS
    // by the time it reaches a controller. The @Public() decorator exempts
    // routes that should skip this check (e.g., health, swagger).
    { provide: APP_GUARD, useClass: AuthContextGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // RequestId + SecurityHeaders + MockAuth run for every request.
    // The mock-auth middleware short-circuits on non-/api paths itself so that
    // Swagger docs and liveness probes stay anonymous.
    consumer
      .apply(RequestIdMiddleware, SecurityHeadersMiddleware, MockAuthMiddleware)
      .forRoutes({ path: '*splat', method: RequestMethod.ALL });
  }
}
