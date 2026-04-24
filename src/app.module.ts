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
import { OrdersModule } from '@modules/orders/orders.module';
import { ArchivalModule } from '@modules/archival/archival.module';
import { MockDataModule } from '@modules/mock-data/mock-data.module';

@Module({
  imports: [
    AppClsModule,
    AppConfigModule,
    AppLoggerModule,
    DatabaseModule,
    TelemetryModule,
    OrdersModule,
    ArchivalModule,
    MockDataModule,
  ],
  providers: [AllExceptionsFilter, { provide: APP_GUARD, useClass: AuthContextGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware, SecurityHeadersMiddleware, MockAuthMiddleware)
      .forRoutes({ path: '*splat', method: RequestMethod.ALL });
  }
}
