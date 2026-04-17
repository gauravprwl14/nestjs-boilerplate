// OTel SDK must be initialised before any other imports so that
// auto-instrumentation patches are applied before modules are loaded.
import { initOtelSdk } from '@telemetry/otel-sdk';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, INestApplication, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfigService } from '@config/config.service';
import { AppLogger } from '@logger/logger.service';
import { initLoggerDelegation } from '@logger/logger.delegate';
import { AllExceptionsFilter } from '@common/filters/all-exceptions.filter';
import { TransformInterceptor } from '@common/interceptors/transform.interceptor';
import { LoggingInterceptor } from '@common/interceptors/logging.interceptor';
import { TimeoutInterceptor } from '@common/interceptors/timeout.interceptor';
import { setupProcessHandlers } from '@/bootstrap/process-handlers';
import {
  SWAGGER_PATH,
  SWAGGER_TITLE,
  SWAGGER_DESCRIPTION,
  SWAGGER_VERSION,
} from '@common/constants';

async function bootstrap(): Promise<void> {
  // ── OTel SDK must start before NestFactory.create ──────────────────────────
  // Read OTel config directly from process.env here because AppConfigService
  // is not yet available at this point in the bootstrap lifecycle.
  initOtelSdk({
    enabled: process.env.OTEL_ENABLED === 'true',
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'ai-native-nestjs-backend',
    exporterEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    exporterProtocol: process.env.OTEL_EXPORTER_OTLP_PROTOCOL ?? 'grpc',
    environment: process.env.NODE_ENV ?? 'development',
  });
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(AppConfigService);
  const logger = app.get(AppLogger);

  // Set AppLogger as the NestJS application logger (standard log/warn/error/debug routing)
  app.useLogger(logger);
  // Enable custom methods (logEvent, logError, addSpanAttributes) on all Logger instances
  // via prototype delegation — any `new Logger(context)` in services gets these methods
  initLoggerDelegation(logger);
  logger.setContext('Bootstrap');

  // Global prefix is just 'api' — no version here.
  // URI versioning (e.g. /api/v1/...) is handled by @Controller({ version: '1' }) decorators.
  app.setGlobalPrefix(config.app.apiPrefix);
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: config.app.apiVersion,
  });

  setupSecurity(app, config);
  setupGlobalPipes(app);
  setupGlobalFilters(app);
  setupGlobalInterceptors(app, logger);
  setupSwagger(app, config, logger);
  setupProcessHandlers(app, logger, config.shutdown.timeoutMs);

  await startServer(app, config, logger);

  // Must be registered AFTER listen() so it's after all NestJS routes
  setupFallbackErrorHandler(app);
}

function setupSecurity(app: INestApplication, config: AppConfigService): void {
  app.use(helmet());
  app.enableCors({
    origin: config.cors.origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-user-id'],
  });
}

/**
 * Register global exception filters from the DI container.
 * Using useGlobalFilters with DI-resolved instances ensures both:
 * - Router-level exceptions (404s from Express) are caught
 * - Filters have access to injected dependencies (AppLogger, etc.)
 */
function setupGlobalFilters(app: INestApplication): void {
  // Resolve from DI so it has injected AppLogger, then register globally
  // so it catches router-level exceptions (404s from Express layer).
  const allExceptionsFilter = app.get(AllExceptionsFilter);
  app.useGlobalFilters(allExceptionsFilter);
}

function setupGlobalPipes(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
}

function setupGlobalInterceptors(app: INestApplication, logger: AppLogger): void {
  app.useGlobalInterceptors(
    new TimeoutInterceptor(),
    new LoggingInterceptor(logger),
    new TransformInterceptor(),
  );
}

function setupSwagger(app: INestApplication, config: AppConfigService, logger: AppLogger): void {
  if (config.isProduction) return;

  try {
    const swaggerConfig = new DocumentBuilder()
      .setTitle(SWAGGER_TITLE)
      .setDescription(SWAGGER_DESCRIPTION)
      .setVersion(SWAGGER_VERSION)
      .addApiKey({ type: 'apiKey', in: 'header', name: 'x-user-id' }, 'x-user-id')
      .addTag('Departments', 'Department CRUD and hierarchy. Error codes: DAT0001, DAT0009, VAL0001, VAL0008')
      .addTag('Tweets', 'Tweet creation + timeline. Error codes: DAT0001, VAL0001, VAL0007, VAL0008, AUZ0004')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(SWAGGER_PATH, app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'none',
        filter: true,
        showRequestDuration: true,
      },
    });

    logger.logEvent('swagger.initialized', {
      attributes: { path: SWAGGER_PATH },
    });
  } catch (error) {
    logger.logError(
      'swagger.initialization.failed',
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

async function startServer(app: INestApplication, config: AppConfigService, logger: AppLogger): Promise<void> {
  const { port, host, name } = config.app;
  await app.listen(port, host);
  logger.logEvent('server.started', {
    attributes: {
      name,
      port,
      host,
      environment: config.app.nodeEnv,
    },
  });
}

/**
 * Registers a fallback Express error handler that catches exceptions
 * escaping NestJS's filter chain (e.g., 404s from the router layer
 * intercepted by OTel Express instrumentation before NestJS filters run).
 *
 * Must be called AFTER app.listen() so it's registered after all NestJS routes.
 */
function setupFallbackErrorHandler(app: INestApplication): void {
  const expressApp = app.getHttpAdapter().getInstance();

  // Express error handler (4 args signature) — catches thrown exceptions
  expressApp.use((err: any, req: any, res: any, _next: any) => {
    if (res.headersSent) return;
    const statusCode = err.status || err.statusCode || 500;
    const message = err.response?.message || err.message || 'Internal server error';
    const code = statusCode === 404 ? 'DAT0001' : 'SRV0001';
    res.status(statusCode).json({
      success: false,
      errors: [{ code, message: typeof message === 'string' ? message : String(message) }],
      requestId: req.id ?? '',
      timestamp: new Date().toISOString(),
    });
  });
}

bootstrap();
