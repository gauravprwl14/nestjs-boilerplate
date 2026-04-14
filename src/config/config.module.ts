import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvConfig } from '@config/schemas/env.schema';
import { AppConfigService } from '@config/config.service';

/**
 * Global configuration module.
 *
 * Loads environment variables from .env files in priority order,
 * validates them with Zod, and exposes AppConfigService globally.
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        `.env.${process.env.NODE_ENV ?? 'development'}.local`,
        `.env.${process.env.NODE_ENV ?? 'development'}`,
        '.env.local',
        '.env',
      ],
      validate: validateEnvConfig,
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
