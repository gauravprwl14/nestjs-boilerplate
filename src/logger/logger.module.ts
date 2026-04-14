import { Global, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigService } from '@config/config.service';
import { AppConfigModule } from '@config/config.module';
import { AppLogger } from './logger.service';
import { createPinoConfig } from './logger.config';

/**
 * Global logger module.
 *
 * Configures nestjs-pino asynchronously using AppConfigService and exposes
 * AppLogger as the application-wide structured logger.
 */
@Global()
@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (configService: AppConfigService): ReturnType<typeof createPinoConfig> => {
        return createPinoConfig({
          serviceName: configService.app.name,
          logLevel: configService.app.logLevel,
          isDevelopment: configService.isDevelopment,
        });
      },
    }),
  ],
  providers: [AppLogger],
  exports: [AppLogger],
})
export class AppLoggerModule {}
