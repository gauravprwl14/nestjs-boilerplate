import { z } from 'zod';
import {
  DEFAULT_APP_PORT,
  DEFAULT_APP_HOST,
  DEFAULT_API_PREFIX,
  DEFAULT_API_VERSION,
  DEFAULT_LOG_LEVEL,
  DEFAULT_SHUTDOWN_TIMEOUT_MS,
} from '@common/constants';

// ─── Sub-schemas ─────────────────────────────────────────────────────────────

export const appConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().default('order-management'),
  APP_PORT: z.coerce.number().int().positive().default(DEFAULT_APP_PORT),
  APP_HOST: z.string().default(DEFAULT_APP_HOST),
  API_PREFIX: z.string().default(DEFAULT_API_PREFIX),
  API_VERSION: z.string().default(DEFAULT_API_VERSION),
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
    .default(
      DEFAULT_LOG_LEVEL as 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent',
    ),
});

export const databaseConfigSchema = z.object({
  DATABASE_URL: z.string().url(),

  DB_PRIMARY_HOST: z.string().default('localhost'),
  DB_PRIMARY_PORT: z.coerce.number().int().positive().default(5432),
  DB_PRIMARY_NAME: z.string().default('primary_db'),
  DB_PRIMARY_USER: z.string().default('ecom_user'),
  DB_PRIMARY_PASSWORD: z.string().default('ecom_pass'),

  DB_REPLICA_1_HOST: z.string().default('localhost'),
  DB_REPLICA_1_PORT: z.coerce.number().int().positive().default(5433),
  DB_REPLICA_2_HOST: z.string().default('localhost'),
  DB_REPLICA_2_PORT: z.coerce.number().int().positive().default(5434),

  DB_METADATA_HOST: z.string().default('localhost'),
  DB_METADATA_PORT: z.coerce.number().int().positive().default(5435),
  DB_METADATA_NAME: z.string().default('metadata_archive_db'),
  DB_METADATA_USER: z.string().default('ecom_user'),
  DB_METADATA_PASSWORD: z.string().default('ecom_pass'),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
});

export const otelConfigSchema = z.object({
  OTEL_ENABLED: z.coerce.boolean().default(false),
  OTEL_SERVICE_NAME: z.string().default('enterprise-twitter'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  OTEL_EXPORTER_OTLP_PROTOCOL: z.enum(['grpc', 'http', 'http/protobuf']).default('grpc'),
});

export const corsConfigSchema = z.object({
  CORS_ORIGINS: z.string().default('*'),
});

export const shutdownConfigSchema = z.object({
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(DEFAULT_SHUTDOWN_TIMEOUT_MS),
});

// ─── Combined schema ──────────────────────────────────────────────────────────

export const envConfigSchema = appConfigSchema
  .extend(databaseConfigSchema.shape)
  .extend(otelConfigSchema.shape)
  .extend(corsConfigSchema.shape)
  .extend(shutdownConfigSchema.shape);

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
      .map(issue => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `Environment configuration validation failed:\n${errors}\n\nPlease check your .env file.`,
    );
  }

  return result.data;
}
