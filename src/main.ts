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
import { AllExceptionsFilter } from '@common/filters/all-exceptions.filter';
import { PrismaExceptionFilter } from '@common/filters/prisma-exception.filter';
import { TransformInterceptor } from '@common/interceptors/transform.interceptor';
import { LoggingInterceptor } from '@common/interceptors/logging.interceptor';
import { TimeoutInterceptor } from '@common/interceptors/timeout.interceptor';
import { setupProcessHandlers } from '@/bootstrap/process-handlers';
import {
  SWAGGER_PATH,
  SWAGGER_TITLE,
  SWAGGER_DESCRIPTION,
  SWAGGER_VERSION,
  API_KEY_HEADER,
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

  app.useLogger(logger);
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
  setupGlobalFilters(app, logger);
  setupGlobalInterceptors(app, logger);
  setupSwagger(app, config, logger);
  setupProcessHandlers(app, logger, config.shutdown.timeoutMs);

  await startServer(app, config, logger);
}

function setupSecurity(app: INestApplication, config: AppConfigService): void {
  app.use(helmet());
  app.enableCors({
    origin: config.cors.origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', API_KEY_HEADER],
  });
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

function setupGlobalFilters(app: INestApplication, logger: AppLogger): void {
  // Order matters: last registered runs first
  // AllExceptionsFilter catches everything, PrismaExceptionFilter converts Prisma errors first
  app.useGlobalFilters(
    new AllExceptionsFilter(logger),
    new PrismaExceptionFilter(),
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
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'jwt')
      .addApiKey({ type: 'apiKey', in: 'header', name: API_KEY_HEADER }, 'api-key')
      .addTag('Health', 'Health check endpoints. Error codes: GEN0003')
      .addTag('Authentication', 'User authentication and API key management. Error codes: AUT0001-AUT0007')
      .addTag('Users', 'User profile management. Error codes: DAT0001, VAL0001')
      .addTag('Todo Lists', 'Todo list CRUD operations. Error codes: DAT0001, DAT0002, VAL0001')
      .addTag('Todo Items', 'Todo item CRUD and status transitions. Error codes: DAT0001, DAT0002, VAL0001, VAL0004')
      .addTag('Tags', 'Tag CRUD and assignment to todo items. Error codes: DAT0001, DAT0002, DAT0003')
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

bootstrap();
