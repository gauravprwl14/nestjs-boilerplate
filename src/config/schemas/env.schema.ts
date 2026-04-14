import { z } from 'zod';
import {
  DEFAULT_APP_PORT,
  DEFAULT_APP_HOST,
  DEFAULT_API_PREFIX,
  DEFAULT_API_VERSION,
  DEFAULT_LOG_LEVEL,
  DEFAULT_SHUTDOWN_TIMEOUT_MS,
  MIN_SECRET_LENGTH,
} from '@common/constants';

// ─── Sub-schemas ─────────────────────────────────────────────────────────────

export const appConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().default('ai-native-nestjs-backend'),
  APP_PORT: z.coerce.number().int().positive().default(DEFAULT_APP_PORT),
  APP_HOST: z.string().default(DEFAULT_APP_HOST),
  API_PREFIX: z.string().default(DEFAULT_API_PREFIX),
  API_VERSION: z.string().default(DEFAULT_API_VERSION),
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
    .default(DEFAULT_LOG_LEVEL as 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent'),
});

export const databaseConfigSchema = z.object({
  DATABASE_URL: z.string().url(),
});

export const redisConfigSchema = z.object({
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().int().min(0).default(0),
});

export const authConfigSchema = z.object({
  JWT_ACCESS_SECRET: z.string().min(MIN_SECRET_LENGTH),
  JWT_ACCESS_EXPIRATION: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(MIN_SECRET_LENGTH),
  JWT_REFRESH_EXPIRATION: z.string().default('7d'),
  API_KEY_ENCRYPTION_SECRET: z.string().min(MIN_SECRET_LENGTH),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(31).default(12),
});

export const otelConfigSchema = z.object({
  OTEL_ENABLED: z.coerce.boolean().default(false),
  OTEL_SERVICE_NAME: z.string().default('ai-native-nestjs-backend'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  OTEL_EXPORTER_OTLP_PROTOCOL: z
    .enum(['grpc', 'http', 'http/protobuf'])
    .default('grpc'),
});

export const throttleConfigSchema = z.object({
  THROTTLE_TTL: z.coerce.number().int().positive().default(60),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),
});

export const corsConfigSchema = z.object({
  CORS_ORIGINS: z.string().default('*'),
});

export const shutdownConfigSchema = z.object({
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(DEFAULT_SHUTDOWN_TIMEOUT_MS),
});

// ─── Combined schema ──────────────────────────────────────────────────────────

export const envConfigSchema = appConfigSchema
  .merge(databaseConfigSchema)
  .merge(redisConfigSchema)
  .merge(authConfigSchema)
  .merge(otelConfigSchema)
  .merge(throttleConfigSchema)
  .merge(corsConfigSchema)
  .merge(shutdownConfigSchema);

// ─── Types ────────────────────────────────────────────────────────────────────

export type EnvConfig = z.infer<typeof envConfigSchema>;

// ─── Validation function ──────────────────────────────────────────────────────

/**
 * Validates the environment configuration against the Zod schema.
 * Throws a descriptive error listing all failing fields if validation fails.
 */
export function validateEnvConfig(config: Record<string, unknown>): EnvConfig {
  const result = envConfigSchema.safeParse(config);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `Environment configuration validation failed:\n${errors}\n\nPlease check your .env file.`,
    );
  }

  return result.data;
}
