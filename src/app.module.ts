import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppConfigModule } from '@config/config.module';
import { AppConfigService } from '@config/config.service';
import { PrismaModule } from '@database/prisma.module';
import { AppLoggerModule } from '@logger/logger.module';
import { HealthModule } from '@modules/health/health.module';
import { AuthModule } from '@modules/auth/auth.module';
import { UsersModule } from '@modules/users/users.module';
import { RequestIdMiddleware } from '@common/middleware/request-id.middleware';
import { SecurityHeadersMiddleware } from '@common/middleware/security-headers.middleware';

@Module({
  imports: [
    // Core
    AppConfigModule,
    AppLoggerModule,
    PrismaModule,
    // Rate limiting
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        throttlers: [{ ttl: config.throttle.ttl, limit: config.throttle.limit }],
      }),
    }),
    // Feature modules
    HealthModule,
    AuthModule,
    UsersModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, SecurityHeadersMiddleware).forRoutes('*');
  }
}
