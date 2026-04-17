import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppConfigModule } from '@config/config.module';
import { AppConfigService } from '@config/config.service';
import { PrismaModule } from '@database/prisma.module';
import { DatabaseModule } from '@database/database.module';
import { AppLoggerModule } from '@logger/logger.module';
import { HealthModule } from '@modules/health/health.module';
import { TelemetryModule } from '@telemetry/telemetry.module';
import { AuthModule } from '@modules/auth/auth.module';
import { UsersModule } from '@modules/users/users.module';
import { TodoListsModule } from '@modules/todo-lists/todo-lists.module';
import { TodoItemsModule } from '@modules/todo-items/todo-items.module';
import { TagsModule } from '@modules/tags/tags.module';
import { QueueModule } from './queue/queue.module';
import { AllExceptionsFilter } from '@common/filters/all-exceptions.filter';
import { RequestIdMiddleware } from '@common/middleware/request-id.middleware';
import { SecurityHeadersMiddleware } from '@common/middleware/security-headers.middleware';
import { AppClsModule } from '@common/cls/cls.module';

@Module({
  imports: [
    // CLS must be imported before other modules that use it
    AppClsModule,
    // Core
    AppConfigModule,
    AppLoggerModule,
    PrismaModule,
    DatabaseModule,
    TelemetryModule,
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
    QueueModule,
    TodoListsModule,
    TodoItemsModule,
    TagsModule,
  ],
  providers: [
    // AllExceptionsFilter registered as a provider for DI resolution in main.ts.
    // The actual global registration happens via useGlobalFilters() in main.ts.
    AllExceptionsFilter,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, SecurityHeadersMiddleware).forRoutes('*');
  }
}
