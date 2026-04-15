import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AppConfigService } from '@config/config.service';
import { UsersModule } from '@modules/users/users.module';
import { AuthService } from './auth.service';
import { ApiKeysService } from './api-keys.service';
import { AuthController } from './auth.controller';
import { ApiKeysController } from './api-keys.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ApiKeyStrategy } from './strategies/api-key.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ApiKeyAuthGuard } from './guards/api-key-auth.guard';
import { CombinedAuthGuard } from './guards/combined-auth.guard';
import { RolesGuard } from './guards/roles.guard';

/**
 * Authentication module providing JWT and API Key authentication.
 *
 * Registers the JwtAuthGuard globally so all routes require authentication
 * by default. Public routes must be decorated with @Public().
 */
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        secret: config.auth.jwtAccessSecret,
        signOptions: { expiresIn: config.auth.jwtAccessExpiration },
      }),
    }),
    UsersModule,
  ],
  controllers: [AuthController, ApiKeysController],
  providers: [
    AuthService,
    ApiKeysService,
    JwtStrategy,
    ApiKeyStrategy,
    JwtAuthGuard,
    ApiKeyAuthGuard,
    CombinedAuthGuard,
    RolesGuard,
    // Register JwtAuthGuard as the global APP_GUARD
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
