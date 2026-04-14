# Plan 1: Foundation — Project Init, Config, Database, Errors, Logger, Bootstrap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the NestJS project foundation with config validation, Prisma database, error handling system, custom logger with OTel-aware methods, and a properly structured bootstrap.

**Architecture:** NestJS 11 with Express, Zod-validated configuration, Prisma 7 ORM with PostgreSQL, custom AppError/ErrorFactory for structured error responses, Pino-based logger with configurable log levels and span integration, and a bootstrap split into focused SRP functions.

**Tech Stack:** NestJS 11, TypeScript 5.8, SWC, Prisma 7, PostgreSQL 16, Redis 7, Pino, Zod, class-validator, Helmet, Docker Compose

**Reference spec:** `docs/superpowers/specs/2026-04-15-ai-native-nestjs-boilerplate-design.md`

---

## File Structure

### Project Root
- `package.json` — dependencies, scripts
- `tsconfig.json` — TypeScript config with path aliases
- `tsconfig.build.json` — Build-specific TS config
- `nest-cli.json` — NestJS CLI config with SWC
- `.eslintrc.js` — ESLint config
- `.prettierrc` — Prettier config
- `.commitlintrc.js` — Commitlint config
- `.gitignore` — Git ignore rules
- `.env.example` — Documented env vars
- `.env.development` — Dev defaults
- `.env.test` — Test overrides
- `docker-compose.yml` — Dev environment (app, postgres, redis)
- `docker/Dockerfile` — Multi-stage build

### Source Files
- `src/main.ts` — Bootstrap split into focused functions
- `src/app.module.ts` — Root module
- `src/config/config.module.ts` — Global config module
- `src/config/config.service.ts` — Type-safe config getters
- `src/config/schemas/env.schema.ts` — Zod env validation
- `src/common/constants/app.constants.ts` — App-wide constants
- `src/common/constants/error-codes.ts` — Domain-prefixed error codes
- `src/common/constants/index.ts` — Barrel export
- `src/common/interfaces/api-response.interface.ts` — Success/error response types
- `src/common/interfaces/paginated-result.interface.ts` — Pagination types
- `src/common/interfaces/index.ts` — Barrel export
- `src/common/decorators/public.decorator.ts` — @Public() decorator
- `src/common/middleware/request-id.middleware.ts` — X-Request-ID middleware
- `src/common/middleware/security-headers.middleware.ts` — Security headers middleware
- `src/common/pipes/zod-validation.pipe.ts` — Zod validation pipe
- `src/common/pipes/parse-uuid.pipe.ts` — UUID validation pipe
- `src/common/filters/all-exceptions.filter.ts` — Global exception filter
- `src/common/filters/prisma-exception.filter.ts` — Prisma exception filter
- `src/common/interceptors/logging.interceptor.ts` — Request/response logging
- `src/common/interceptors/transform.interceptor.ts` — Response wrapping
- `src/common/interceptors/timeout.interceptor.ts` — Request timeout
- `src/errors/error-codes/index.ts` — Error code definitions
- `src/errors/types/app-error.ts` — AppError class
- `src/errors/types/error-factory.ts` — ErrorFactory static methods
- `src/errors/handlers/prisma-error.handler.ts` — Prisma error mapping
- `src/database/prisma.module.ts` — Prisma module
- `src/database/prisma.service.ts` — Prisma service with health checks
- `src/database/repositories/base.repository.ts` — Generic CRUD repository
- `src/logger/logger.module.ts` — Logger module
- `src/logger/logger.service.ts` — AppLogger implementing IAppLogger
- `src/logger/logger.config.ts` — Pino config factory
- `src/logger/logger.constants.ts` — Redact paths, PII fields
- `src/logger/logger.interfaces.ts` — IAppLogger, ILogOptions, etc.
- `src/logger/utils/trace-context.util.ts` — Trace context extraction
- `src/logger/utils/sanitizer.util.ts` — Safe serialization
- `src/bootstrap/process-handlers.ts` — Signal + error handlers
- `src/bootstrap/process-handlers.constants.ts` — Exit codes, timeouts
- `src/bootstrap/graceful-shutdown.ts` — NestJS-aware shutdown
- `src/modules/health/health.module.ts` — Health module
- `src/modules/health/health.controller.ts` — Health endpoints
- `src/modules/health/health.service.ts` — Health service

### Prisma
- `prisma/schema.prisma` — Database schema

### Docker
- `docker/Dockerfile` — Multi-stage Dockerfile
- `docker-compose.yml` — Dev compose with postgres + redis

---

## Task 1: Project Initialization & Package Setup

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.build.json`
- Create: `nest-cli.json`
- Create: `.eslintrc.js`
- Create: `.prettierrc`
- Create: `.commitlintrc.js`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `.env.development`
- Create: `.env.test`

- [ ] **Step 1: Initialize NestJS project with SWC**

```bash
cd /Users/gauravporwal/Sites/projects/gp/ai-native-nestjs-backend
npm init -y
```

- [ ] **Step 2: Install all dependencies**

```bash
# Core NestJS
npm install @nestjs/common@latest @nestjs/core@latest @nestjs/platform-express@latest reflect-metadata rxjs

# Config
npm install @nestjs/config@latest zod

# Database
npm install @prisma/client@latest

# Cache
npm install @nestjs/cache-manager@latest cache-manager@latest cache-manager-redis-yet@latest

# Queue
npm install @nestjs/bullmq@latest bullmq@latest

# Auth (installed now, used in Plan 3)
npm install @nestjs/jwt@latest @nestjs/passport@latest passport passport-jwt passport-custom bcrypt

# Validation
npm install class-validator class-transformer

# Logging
npm install nestjs-pino pino pino-http pino-pretty

# Swagger
npm install @nestjs/swagger@latest

# Security
npm install helmet @nestjs/throttler@latest

# Health
npm install @nestjs/terminus@latest

# Schedule
npm install @nestjs/schedule@latest

# OpenTelemetry (installed now, configured in Plan 2)
npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/sdk-trace-node @opentelemetry/sdk-metrics @opentelemetry/exporter-trace-otlp-grpc @opentelemetry/exporter-metrics-otlp-grpc @opentelemetry/resources @opentelemetry/semantic-conventions @opentelemetry/instrumentation-http @opentelemetry/instrumentation-express @opentelemetry/auto-instrumentations-node

# Utils
npm install uuid
npm install @types/uuid --save-dev

# Dev dependencies
npm install --save-dev @nestjs/cli@latest @nestjs/schematics@latest @nestjs/testing@latest
npm install --save-dev typescript@latest @swc/cli@latest @swc/core@latest
npm install --save-dev @types/node @types/express @types/passport-jwt @types/bcrypt
npm install --save-dev eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-plugin-prettier eslint-config-prettier prettier
npm install --save-dev jest ts-jest @types/jest supertest @types/supertest
npm install --save-dev husky lint-staged @commitlint/cli @commitlint/config-conventional
npm install --save-dev prisma@latest
npm install --save-dev @faker-js/faker
```

- [ ] **Step 3: Write `tsconfig.json` with path aliases**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2022",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "strictBindCallApply": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "paths": {
      "@/*": ["src/*"],
      "@config/*": ["src/config/*"],
      "@common/*": ["src/common/*"],
      "@modules/*": ["src/modules/*"],
      "@errors/*": ["src/errors/*"],
      "@database/*": ["src/database/*"],
      "@logger/*": ["src/logger/*"],
      "@telemetry/*": ["src/telemetry/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

- [ ] **Step 4: Write `tsconfig.build.json`**

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "dist", "test", "**/*.spec.ts"]
}
```

- [ ] **Step 5: Write `nest-cli.json` with SWC**

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "builder": "swc",
    "typeCheck": true,
    "deleteOutDir": true
  }
}
```

- [ ] **Step 6: Write `.eslintrc.js`**

```javascript
module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js', 'dist/', 'node_modules/'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/naming-convention': [
      'error',
      { selector: 'class', format: ['PascalCase'] },
      { selector: 'enumMember', format: ['UPPER_CASE'] },
      { selector: 'variable', modifiers: ['const', 'exported'], format: ['camelCase', 'UPPER_CASE', 'PascalCase'] },
    ],
    'no-console': 'warn',
    'prefer-const': 'error',
    'no-var': 'error',
  },
};
```

- [ ] **Step 7: Write `.prettierrc`**

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "tabWidth": 2,
  "semi": true,
  "printWidth": 100,
  "bracketSpacing": true,
  "arrowParens": "avoid",
  "endOfLine": "lf"
}
```

- [ ] **Step 8: Write `.commitlintrc.js`**

```javascript
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'],
    ],
    'subject-case': [2, 'always', 'lower-case'],
    'header-max-length': [2, 'always', 72],
  },
};
```

- [ ] **Step 9: Write `.gitignore`**

```gitignore
# Dependencies
node_modules/
package-lock.json

# Build
dist/
build/

# Environment
.env
.env.local
.env.production

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Testing
coverage/

# Prisma
prisma/*.db
prisma/*.db-journal

# Logs
*.log
logs/

# Docker
docker-compose.override.yml
```

- [ ] **Step 10: Write `.env.example`**

```bash
# =============================================================================
# Application
# =============================================================================
NODE_ENV=development                    # development | test | production
APP_NAME=ai-native-nestjs-backend      # Application name
APP_PORT=3000                           # HTTP port
APP_HOST=0.0.0.0                        # Bind address
API_PREFIX=api                          # API route prefix
API_VERSION=v1                          # API version
LOG_LEVEL=info                          # trace | debug | info | warn | error | fatal

# =============================================================================
# Database (PostgreSQL)
# =============================================================================
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/todo_dev?schema=public

# =============================================================================
# Redis (Cache + BullMQ)
# =============================================================================
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# =============================================================================
# Authentication
# =============================================================================
JWT_ACCESS_SECRET=your-access-secret-min-32-chars-long!!   # Min 32 characters
JWT_ACCESS_EXPIRATION=15m                                   # Access token TTL
JWT_REFRESH_SECRET=your-refresh-secret-min-32-chars-long!! # Min 32 characters
JWT_REFRESH_EXPIRATION=7d                                   # Refresh token TTL
API_KEY_ENCRYPTION_SECRET=your-api-key-secret-min-32-chars # Min 32 characters
BCRYPT_ROUNDS=12                                            # Password hash rounds

# =============================================================================
# OpenTelemetry
# =============================================================================
OTEL_ENABLED=true                                           # Enable/disable OTel
OTEL_SERVICE_NAME=ai-native-nestjs-backend                  # Service name in traces
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317           # OTel Collector gRPC
OTEL_EXPORTER_OTLP_PROTOCOL=grpc                            # grpc | http/protobuf

# =============================================================================
# Rate Limiting
# =============================================================================
THROTTLE_TTL=60000                      # Time window in ms
THROTTLE_LIMIT=100                      # Max requests per window

# =============================================================================
# CORS
# =============================================================================
CORS_ORIGINS=http://localhost:3000,http://localhost:3001

# =============================================================================
# Shutdown
# =============================================================================
SHUTDOWN_TIMEOUT_MS=10000               # Graceful shutdown timeout
```

- [ ] **Step 11: Write `.env.development`**

```bash
NODE_ENV=development
APP_NAME=ai-native-nestjs-backend
APP_PORT=3000
APP_HOST=0.0.0.0
API_PREFIX=api
API_VERSION=v1
LOG_LEVEL=debug

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/todo_dev?schema=public

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

JWT_ACCESS_SECRET=dev-access-secret-must-be-32-chars-long!
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_SECRET=dev-refresh-secret-must-be-32-chars-lo!
JWT_REFRESH_EXPIRATION=7d
API_KEY_ENCRYPTION_SECRET=dev-api-key-secret-must-be-32-chars!
BCRYPT_ROUNDS=10

OTEL_ENABLED=true
OTEL_SERVICE_NAME=ai-native-nestjs-backend
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
OTEL_EXPORTER_OTLP_PROTOCOL=grpc

THROTTLE_TTL=60000
THROTTLE_LIMIT=100

CORS_ORIGINS=http://localhost:3000,http://localhost:3001

SHUTDOWN_TIMEOUT_MS=10000
```

- [ ] **Step 12: Write `.env.test`**

```bash
NODE_ENV=test
APP_NAME=ai-native-nestjs-backend-test
APP_PORT=3001
APP_HOST=0.0.0.0
API_PREFIX=api
API_VERSION=v1
LOG_LEVEL=warn

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/todo_test?schema=public

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=1

JWT_ACCESS_SECRET=test-access-secret-must-be-32-chars-lo!
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_SECRET=test-refresh-secret-must-be-32-chars-l!
JWT_REFRESH_EXPIRATION=7d
API_KEY_ENCRYPTION_SECRET=test-api-key-secret-must-be-32-chars!
BCRYPT_ROUNDS=4

OTEL_ENABLED=false
OTEL_SERVICE_NAME=ai-native-nestjs-backend-test
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
OTEL_EXPORTER_OTLP_PROTOCOL=grpc

THROTTLE_TTL=60000
THROTTLE_LIMIT=1000

CORS_ORIGINS=http://localhost:3001

SHUTDOWN_TIMEOUT_MS=5000
```

- [ ] **Step 13: Update `package.json` scripts**

Update the scripts section in `package.json`:

```json
{
  "scripts": {
    "build": "nest build",
    "format": "prettier --write \"src/**/*.ts\" \"test/**/*.ts\"",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:debug": "nest start --debug --watch",
    "start:prod": "node dist/main",
    "lint": "eslint \"{src,test}/**/*.ts\" --fix",
    "type:check": "tsc --noEmit",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage",
    "test:debug": "node --inspect-brk -r tsconfig-paths/register -r ts-node/register node_modules/.bin/jest --runInBand",
    "test:e2e": "jest --config ./test/jest-e2e.json",
    "prisma:generate": "prisma generate",
    "prisma:migrate:dev": "prisma migrate dev",
    "prisma:migrate:deploy": "prisma migrate deploy",
    "prisma:migrate:reset": "prisma migrate reset",
    "prisma:studio": "prisma studio",
    "prisma:seed": "ts-node prisma/seed.ts",
    "db:push": "prisma db push",
    "swagger:export": "ts-node scripts/export-swagger.ts",
    "prepare": "husky"
  }
}
```

- [ ] **Step 14: Write `jest.config.js`**

```javascript
/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  maxWorkers: '50%',
  testTimeout: 30000,
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@common/(.*)$': '<rootDir>/src/common/$1',
    '^@modules/(.*)$': '<rootDir>/src/modules/$1',
    '^@errors/(.*)$': '<rootDir>/src/errors/$1',
    '^@database/(.*)$': '<rootDir>/src/database/$1',
    '^@logger/(.*)$': '<rootDir>/src/logger/$1',
    '^@telemetry/(.*)$': '<rootDir>/src/telemetry/$1',
  },
  coverageThresholds: {
    global: {
      lines: 70,
      statements: 70,
      branches: 35,
      functions: 60,
    },
  },
  coveragePathIgnorePatterns: [
    'node_modules',
    'dist',
    '.module.ts',
    '.interface.ts',
    '.dto.ts',
    'main.ts',
    'index.ts',
  ],
};
```

- [ ] **Step 15: Initialize Husky**

```bash
npx husky init
echo 'npx lint-staged' > .husky/pre-commit
echo 'npx --no -- commitlint --edit "$1"' > .husky/commit-msg
```

Add to `package.json`:

```json
{
  "lint-staged": {
    "*.ts": ["eslint --fix", "prettier --write"],
    "*.{json,md}": ["prettier --write"]
  }
}
```

- [ ] **Step 16: Commit**

```bash
git add -A
git commit -m "chore: initialize project with nestjs, swc, eslint, prettier, husky"
```

---

## Task 2: Constants & Interfaces

**Files:**
- Create: `src/common/constants/app.constants.ts`
- Create: `src/common/constants/error-codes.ts`
- Create: `src/common/constants/index.ts`
- Create: `src/common/interfaces/api-response.interface.ts`
- Create: `src/common/interfaces/paginated-result.interface.ts`
- Create: `src/common/interfaces/index.ts`

- [ ] **Step 1: Write `src/common/constants/app.constants.ts`**

```typescript
/** Default API route prefix */
export const DEFAULT_API_PREFIX = 'api';

/** Default API version */
export const DEFAULT_API_VERSION = 'v1';

/** Default HTTP port */
export const DEFAULT_APP_PORT = 3000;

/** Default bind address */
export const DEFAULT_APP_HOST = '0.0.0.0';

/** Default log level */
export const DEFAULT_LOG_LEVEL = 'info';

/** Default request timeout in milliseconds */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/** Default graceful shutdown timeout in milliseconds */
export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;

/** Default pagination limit */
export const DEFAULT_PAGE_LIMIT = 10;

/** Maximum pagination limit */
export const MAX_PAGE_LIMIT = 100;

/** Default pagination page */
export const DEFAULT_PAGE = 1;

/** Request ID header name */
export const REQUEST_ID_HEADER = 'x-request-id';

/** API Key header name */
export const API_KEY_HEADER = 'x-api-key';

/** Swagger docs path */
export const SWAGGER_PATH = 'docs';

/** Swagger title */
export const SWAGGER_TITLE = 'AI-Native NestJS Backend API';

/** Swagger description */
export const SWAGGER_DESCRIPTION = 'Todo application API with JWT + API Key authentication';

/** Swagger version */
export const SWAGGER_VERSION = '1.0';

/** Public route metadata key */
export const IS_PUBLIC_KEY = 'isPublic';

/** Roles metadata key */
export const ROLES_KEY = 'roles';

/** Minimum secret length for JWT/API Key secrets */
export const MIN_SECRET_LENGTH = 32;

/** API Key prefix length for display */
export const API_KEY_PREFIX_LENGTH = 8;
```

- [ ] **Step 2: Write `src/common/constants/error-codes.ts`**

```typescript
/**
 * Domain-prefixed error codes.
 * Format: PREFIX + 4-digit number.
 * Every unique error scenario MUST have a unique code.
 */
export const ERROR_CODES = {
  // === GEN: General ===
  GEN0001: { code: 'GEN0001', message: 'Rate limit exceeded', statusCode: 429 },
  GEN0002: { code: 'GEN0002', message: 'Request timeout', statusCode: 408 },
  GEN0003: { code: 'GEN0003', message: 'Service unavailable', statusCode: 503 },
  GEN0004: { code: 'GEN0004', message: 'Unknown error', statusCode: 500 },

  // === VAL: Validation ===
  VAL0001: { code: 'VAL0001', message: 'Invalid input', statusCode: 400 },
  VAL0002: { code: 'VAL0002', message: 'Required field missing', statusCode: 400 },
  VAL0003: { code: 'VAL0003', message: 'Field exceeds maximum length', statusCode: 400 },
  VAL0004: { code: 'VAL0004', message: 'Invalid status transition', statusCode: 400 },

  // === AUT: Authentication ===
  AUT0001: { code: 'AUT0001', message: 'Authentication required', statusCode: 401 },
  AUT0002: { code: 'AUT0002', message: 'Token expired', statusCode: 401 },
  AUT0003: { code: 'AUT0003', message: 'Token invalid', statusCode: 401 },
  AUT0004: { code: 'AUT0004', message: 'Account suspended', statusCode: 403 },
  AUT0005: { code: 'AUT0005', message: 'Account locked', statusCode: 423 },
  AUT0006: { code: 'AUT0006', message: 'Invalid credentials', statusCode: 401 },
  AUT0007: { code: 'AUT0007', message: 'Account not verified', statusCode: 403 },

  // === AUZ: Authorization ===
  AUZ0001: { code: 'AUZ0001', message: 'Access forbidden', statusCode: 403 },
  AUZ0002: { code: 'AUZ0002', message: 'Insufficient permissions', statusCode: 403 },
  AUZ0003: { code: 'AUZ0003', message: 'Role required', statusCode: 403 },

  // === DAT: Database ===
  DAT0001: { code: 'DAT0001', message: 'Resource not found', statusCode: 404 },
  DAT0002: { code: 'DAT0002', message: 'Resource conflict', statusCode: 409 },
  DAT0003: { code: 'DAT0003', message: 'Unique constraint violation', statusCode: 409 },
  DAT0004: { code: 'DAT0004', message: 'Foreign key constraint violation', statusCode: 400 },
  DAT0005: { code: 'DAT0005', message: 'Transaction failed', statusCode: 500 },
  DAT0006: { code: 'DAT0006', message: 'Database connection failed', statusCode: 503 },
  DAT0007: { code: 'DAT0007', message: 'Query failed', statusCode: 500 },

  // === SRV: Server/Infrastructure ===
  SRV0001: { code: 'SRV0001', message: 'Internal server error', statusCode: 500 },
  SRV0002: { code: 'SRV0002', message: 'Queue operation failed', statusCode: 500 },
  SRV0003: { code: 'SRV0003', message: 'Cache operation failed', statusCode: 500 },
} as const;

/** Type for error code keys */
export type ErrorCodeKey = keyof typeof ERROR_CODES;

/** Type for a single error code definition */
export interface ErrorCodeDefinition {
  code: string;
  message: string;
  statusCode: number;
}
```

- [ ] **Step 3: Write `src/common/constants/index.ts`**

```typescript
export * from './app.constants';
export * from './error-codes';
```

- [ ] **Step 4: Write `src/common/interfaces/api-response.interface.ts`**

```typescript
/**
 * Standard API success response wrapper.
 * All successful responses follow this shape.
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: ApiResponseMeta;
  timestamp: string;
}

/**
 * Standard API error response wrapper.
 * All error responses follow this shape.
 */
export interface ApiErrorResponse {
  success: false;
  error: ApiErrorDetail;
  timestamp: string;
}

/** Error detail included in error responses */
export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: ApiErrorFieldDetail[];
  requestId?: string;
  traceId?: string;
}

/** Per-field validation error detail */
export interface ApiErrorFieldDetail {
  field: string;
  message: string;
}

/** Response metadata for paginated results */
export interface ApiResponseMeta {
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
  requestId?: string;
  traceId?: string;
}
```

- [ ] **Step 5: Write `src/common/interfaces/paginated-result.interface.ts`**

```typescript
/** Pagination query parameters */
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/** Paginated result wrapper returned by repositories */
export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

/** Pagination metadata */
export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}
```

- [ ] **Step 6: Write `src/common/interfaces/index.ts`**

```typescript
export * from './api-response.interface';
export * from './paginated-result.interface';
```

- [ ] **Step 7: Commit**

```bash
git add src/common/
git commit -m "feat: add constants and interfaces for API responses, pagination, error codes"
```

---

## Task 3: Error Handling System

**Files:**
- Create: `src/errors/error-codes/index.ts`
- Create: `src/errors/types/app-error.ts`
- Create: `src/errors/types/error-factory.ts`
- Create: `src/errors/handlers/prisma-error.handler.ts`

- [ ] **Step 1: Write `src/errors/error-codes/index.ts`**

Re-export from common constants (single source of truth):

```typescript
export { ERROR_CODES, type ErrorCodeKey, type ErrorCodeDefinition } from '@common/constants/error-codes';
```

- [ ] **Step 2: Write `src/errors/types/app-error.ts`**

```typescript
import { HttpException } from '@nestjs/common';
import { ERROR_CODES, type ErrorCodeKey } from '@common/constants';
import type { ApiErrorDetail, ApiErrorFieldDetail } from '@common/interfaces';

/**
 * Core application error class.
 * All application errors should be instances of AppError.
 * Provides structured error responses with error codes, request context, and OTel trace IDs.
 */
export class AppError extends HttpException {
  /** Domain-prefixed error code (e.g., 'DAT0001') */
  readonly code: string;

  /** HTTP status code */
  readonly statusCode: number;

  /** Per-field validation details */
  readonly details?: ApiErrorFieldDetail[];

  /** Original error that caused this error */
  readonly cause?: Error;

  /**
   * Whether this error is operational (expected) vs programming (unexpected).
   * Operational errors are safe to show to clients.
   * Programming errors should be masked with a generic message.
   */
  readonly isOperational: boolean;

  constructor(
    code: string,
    message: string,
    statusCode: number,
    options?: {
      details?: ApiErrorFieldDetail[];
      cause?: Error;
      isOperational?: boolean;
    },
  ) {
    super(message, statusCode);
    this.code = code;
    this.statusCode = statusCode;
    this.details = options?.details;
    this.cause = options?.cause;
    this.isOperational = options?.isOperational ?? true;
  }

  /**
   * Creates an AppError from a registered error code key.
   * @param key - Error code key from ERROR_CODES (e.g., 'DAT0001')
   * @param overrides - Optional message override and additional options
   */
  static fromCode(
    key: ErrorCodeKey,
    overrides?: {
      message?: string;
      details?: ApiErrorFieldDetail[];
      cause?: Error;
    },
  ): AppError {
    const definition = ERROR_CODES[key];
    return new AppError(
      definition.code,
      overrides?.message ?? definition.message,
      definition.statusCode,
      {
        details: overrides?.details,
        cause: overrides?.cause,
        isOperational: true,
      },
    );
  }

  /**
   * Wraps an unknown error into an AppError.
   * If already an AppError, returns as-is.
   * Otherwise wraps with SRV0001 (Internal server error).
   */
  static wrap(error: unknown): AppError {
    if (AppError.isAppError(error)) {
      return error;
    }

    const cause = error instanceof Error ? error : new Error(String(error));
    return new AppError(
      ERROR_CODES.SRV0001.code,
      ERROR_CODES.SRV0001.message,
      ERROR_CODES.SRV0001.statusCode,
      { cause, isOperational: false },
    );
  }

  /** Type guard to check if an error is an AppError */
  static isAppError(error: unknown): error is AppError {
    return error instanceof AppError;
  }

  /**
   * Returns a safe representation for logging.
   * Includes cause stack trace but no sensitive data.
   */
  toLog(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      isOperational: this.isOperational,
      cause: this.cause
        ? { message: this.cause.message, stack: this.cause.stack }
        : undefined,
    };
  }

  /**
   * Returns a safe representation for client responses.
   * Includes requestId and traceId for correlation.
   */
  toResponse(requestId?: string, traceId?: string): ApiErrorDetail {
    return {
      code: this.code,
      message: this.isOperational ? this.message : ERROR_CODES.SRV0001.message,
      details: this.isOperational ? this.details : undefined,
      requestId,
      traceId,
    };
  }
}
```

- [ ] **Step 3: Write `src/errors/types/error-factory.ts`**

```typescript
import { AppError } from './app-error';
import { ERROR_CODES } from '@common/constants';
import type { ApiErrorFieldDetail } from '@common/interfaces';
import { ZodError } from 'zod';

/**
 * Factory class for creating AppError instances.
 * Provides semantic methods for common error scenarios.
 * Avoids scattered `new AppError()` calls throughout the codebase.
 */
export class ErrorFactory {
  /** Validation error with optional field details */
  static validation(message?: string, details?: ApiErrorFieldDetail[]): AppError {
    return AppError.fromCode('VAL0001', { message, details });
  }

  /** Required field missing */
  static requiredField(field: string): AppError {
    return AppError.fromCode('VAL0002', {
      message: `Required field missing: ${field}`,
      details: [{ field, message: 'This field is required' }],
    });
  }

  /** Authentication required */
  static authentication(message?: string): AppError {
    return AppError.fromCode('AUT0001', { message });
  }

  /** Invalid credentials (login) */
  static invalidCredentials(): AppError {
    return AppError.fromCode('AUT0006');
  }

  /** Token expired */
  static tokenExpired(): AppError {
    return AppError.fromCode('AUT0002');
  }

  /** Token invalid */
  static tokenInvalid(): AppError {
    return AppError.fromCode('AUT0003');
  }

  /** Account suspended */
  static accountSuspended(): AppError {
    return AppError.fromCode('AUT0004');
  }

  /** Account locked */
  static accountLocked(): AppError {
    return AppError.fromCode('AUT0005');
  }

  /** Authorization forbidden */
  static authorization(message?: string): AppError {
    return AppError.fromCode('AUZ0001', { message });
  }

  /** Insufficient permissions */
  static insufficientPermissions(): AppError {
    return AppError.fromCode('AUZ0002');
  }

  /** Resource not found */
  static notFound(resource: string, identifier?: string): AppError {
    const message = identifier
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    return AppError.fromCode('DAT0001', { message });
  }

  /** Resource conflict */
  static conflict(message: string): AppError {
    return AppError.fromCode('DAT0002', { message });
  }

  /** Unique constraint violation */
  static uniqueViolation(field: string): AppError {
    return AppError.fromCode('DAT0003', {
      message: `A record with this ${field} already exists`,
      details: [{ field, message: 'Must be unique' }],
    });
  }

  /** Foreign key constraint violation */
  static foreignKeyViolation(field: string): AppError {
    return AppError.fromCode('DAT0004', {
      message: `Referenced ${field} does not exist`,
      details: [{ field, message: 'Invalid reference' }],
    });
  }

  /** Invalid status transition */
  static invalidStatusTransition(from: string, to: string): AppError {
    return AppError.fromCode('VAL0004', {
      message: `Cannot transition from '${from}' to '${to}'`,
    });
  }

  /** Rate limited */
  static rateLimited(): AppError {
    return AppError.fromCode('GEN0001');
  }

  /** Internal server error */
  static internal(cause?: Error): AppError {
    return new AppError(
      ERROR_CODES.SRV0001.code,
      ERROR_CODES.SRV0001.message,
      ERROR_CODES.SRV0001.statusCode,
      { cause, isOperational: false },
    );
  }

  /** Database error */
  static database(message: string, cause?: Error): AppError {
    return AppError.fromCode('DAT0007', { message, cause });
  }

  /** Queue error */
  static queue(message: string, cause?: Error): AppError {
    return AppError.fromCode('SRV0002', { message, cause });
  }

  /** Cache error */
  static cache(message: string, cause?: Error): AppError {
    return AppError.fromCode('SRV0003', { message, cause });
  }

  /**
   * Converts Zod validation errors to an AppError with field details.
   */
  static fromZodErrors(error: ZodError): AppError {
    const details: ApiErrorFieldDetail[] = error.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    return ErrorFactory.validation('Validation failed', details);
  }

  /**
   * Converts class-validator errors to an AppError with field details.
   * @param errors - Array of class-validator ValidationError objects
   */
  static fromClassValidatorErrors(
    errors: Array<{ property: string; constraints?: Record<string, string> }>,
  ): AppError {
    const details: ApiErrorFieldDetail[] = errors.flatMap(error => {
      const constraints = error.constraints ?? {};
      return Object.values(constraints).map(message => ({
        field: error.property,
        message,
      }));
    });
    return ErrorFactory.validation('Validation failed', details);
  }
}
```

- [ ] **Step 4: Write `src/errors/handlers/prisma-error.handler.ts`**

```typescript
import { Prisma } from '@prisma/client';
import { AppError } from '@errors/types/app-error';
import { ERROR_CODES } from '@common/constants';

/**
 * Maps Prisma error codes to AppError instances.
 * Reference: https://www.prisma.io/docs/orm/reference/error-reference
 */

/** Known Prisma error codes and their mappings */
const PRISMA_ERROR_MAP: Record<string, { codeKey: keyof typeof ERROR_CODES; getMessage: (e: Prisma.PrismaClientKnownRequestError) => string }> = {
  /** Unique constraint violation */
  P2002: {
    codeKey: 'DAT0003',
    getMessage: (e) => {
      const target = (e.meta?.target as string[])?.join(', ') ?? 'unknown field';
      return `Unique constraint violation on: ${target}`;
    },
  },
  /** Foreign key constraint violation */
  P2003: {
    codeKey: 'DAT0004',
    getMessage: (e) => {
      const field = (e.meta?.field_name as string) ?? 'unknown field';
      return `Foreign key constraint failed on: ${field}`;
    },
  },
  /** Record not found */
  P2025: {
    codeKey: 'DAT0001',
    getMessage: (e) => {
      const cause = (e.meta?.cause as string) ?? 'Record not found';
      return cause;
    },
  },
  /** Null constraint violation */
  P2011: {
    codeKey: 'VAL0002',
    getMessage: (e) => {
      const field = (e.meta?.constraint as string) ?? 'unknown field';
      return `Required field is null: ${field}`;
    },
  },
  /** Value too long */
  P2000: {
    codeKey: 'VAL0003',
    getMessage: (e) => {
      const field = (e.meta?.column_name as string) ?? 'unknown field';
      return `Value too long for field: ${field}`;
    },
  },
};

/**
 * Converts a Prisma error to an AppError.
 * Returns undefined if the error is not a recognized Prisma error.
 */
export function handlePrismaError(error: unknown): AppError | undefined {
  if (!isPrismaError(error)) {
    return undefined;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const mapping = PRISMA_ERROR_MAP[error.code];
    if (mapping) {
      const definition = ERROR_CODES[mapping.codeKey];
      return new AppError(
        definition.code,
        mapping.getMessage(error),
        definition.statusCode,
        { cause: error, isOperational: true },
      );
    }

    // Unknown Prisma error code — wrap as database error
    return new AppError(
      ERROR_CODES.DAT0007.code,
      `Database error: ${error.message}`,
      ERROR_CODES.DAT0007.statusCode,
      { cause: error, isOperational: false },
    );
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return new AppError(
      ERROR_CODES.VAL0001.code,
      'Database validation error',
      ERROR_CODES.VAL0001.statusCode,
      { cause: error, isOperational: true },
    );
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return new AppError(
      ERROR_CODES.DAT0006.code,
      ERROR_CODES.DAT0006.message,
      ERROR_CODES.DAT0006.statusCode,
      { cause: error, isOperational: false },
    );
  }

  // PrismaClientRustPanicError or PrismaClientUnknownRequestError
  return new AppError(
    ERROR_CODES.SRV0001.code,
    ERROR_CODES.SRV0001.message,
    ERROR_CODES.SRV0001.statusCode,
    { cause: error as Error, isOperational: false },
  );
}

/** Type guard: checks if an error is any Prisma error type */
export function isPrismaError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientValidationError ||
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError ||
    error instanceof Prisma.PrismaClientUnknownRequestError
  );
}

/**
 * Higher-order function that wraps an async function with Prisma error handling.
 * Converts Prisma errors to AppError automatically.
 */
export async function withPrismaErrorHandling<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const appError = handlePrismaError(error);
    if (appError) {
      throw appError;
    }
    throw error;
  }
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors (or only errors from missing modules that will be created in later tasks).

- [ ] **Step 6: Commit**

```bash
git add src/errors/
git commit -m "feat: add error handling system with AppError, ErrorFactory, Prisma error handler"
```

---

## Task 4: Configuration Module with Zod Validation

**Files:**
- Create: `src/config/schemas/env.schema.ts`
- Create: `src/config/config.service.ts`
- Create: `src/config/config.module.ts`

- [ ] **Step 1: Write `src/config/schemas/env.schema.ts`**

```typescript
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

/** App configuration schema */
const appConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().default('ai-native-nestjs-backend'),
  APP_PORT: z.coerce.number().int().positive().default(DEFAULT_APP_PORT),
  APP_HOST: z.string().default(DEFAULT_APP_HOST),
  API_PREFIX: z.string().default(DEFAULT_API_PREFIX),
  API_VERSION: z.string().default(DEFAULT_API_VERSION),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default(DEFAULT_LOG_LEVEL as 'info'),
});

/** Database configuration schema */
const databaseConfigSchema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection string'),
});

/** Redis configuration schema */
const redisConfigSchema = z.object({
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().default(''),
  REDIS_DB: z.coerce.number().int().min(0).default(0),
});

/** Auth configuration schema */
const authConfigSchema = z.object({
  JWT_ACCESS_SECRET: z.string().min(MIN_SECRET_LENGTH, `JWT_ACCESS_SECRET must be at least ${MIN_SECRET_LENGTH} characters`),
  JWT_ACCESS_EXPIRATION: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(MIN_SECRET_LENGTH, `JWT_REFRESH_SECRET must be at least ${MIN_SECRET_LENGTH} characters`),
  JWT_REFRESH_EXPIRATION: z.string().default('7d'),
  API_KEY_ENCRYPTION_SECRET: z.string().min(MIN_SECRET_LENGTH, `API_KEY_ENCRYPTION_SECRET must be at least ${MIN_SECRET_LENGTH} characters`),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(31).default(12),
});

/** OTel configuration schema */
const otelConfigSchema = z.object({
  OTEL_ENABLED: z.coerce.boolean().default(true),
  OTEL_SERVICE_NAME: z.string().default('ai-native-nestjs-backend'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default('http://localhost:4317'),
  OTEL_EXPORTER_OTLP_PROTOCOL: z.enum(['grpc', 'http/protobuf']).default('grpc'),
});

/** Throttle configuration schema */
const throttleConfigSchema = z.object({
  THROTTLE_TTL: z.coerce.number().int().positive().default(60000),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),
});

/** CORS configuration schema */
const corsConfigSchema = z.object({
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
});

/** Shutdown configuration schema */
const shutdownConfigSchema = z.object({
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(DEFAULT_SHUTDOWN_TIMEOUT_MS),
});

/** Combined environment configuration schema */
export const envConfigSchema = appConfigSchema
  .merge(databaseConfigSchema)
  .merge(redisConfigSchema)
  .merge(authConfigSchema)
  .merge(otelConfigSchema)
  .merge(throttleConfigSchema)
  .merge(corsConfigSchema)
  .merge(shutdownConfigSchema);

/** Inferred type from the combined schema */
export type EnvConfig = z.infer<typeof envConfigSchema>;

/**
 * Validates environment variables against the Zod schema.
 * Logs all validation errors and throws if invalid.
 */
export function validateEnvConfig(config: Record<string, unknown>): EnvConfig {
  const result = envConfigSchema.safeParse(config);

  if (!result.success) {
    const formattedErrors = result.error.errors
      .map(e => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n');

    throw new Error(
      `Environment validation failed:\n${formattedErrors}\n\nCheck your .env file against .env.example`,
    );
  }

  return result.data;
}
```

- [ ] **Step 2: Write `src/config/config.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from './schemas/env.schema';

/**
 * Type-safe configuration service.
 * Provides strongly-typed getters for all configuration sections.
 * Never access process.env directly — always use this service.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  /** Application configuration */
  get app() {
    return {
      nodeEnv: this.configService.get('NODE_ENV', { infer: true }),
      name: this.configService.get('APP_NAME', { infer: true }),
      port: this.configService.get('APP_PORT', { infer: true }),
      host: this.configService.get('APP_HOST', { infer: true }),
      apiPrefix: this.configService.get('API_PREFIX', { infer: true }),
      apiVersion: this.configService.get('API_VERSION', { infer: true }),
      logLevel: this.configService.get('LOG_LEVEL', { infer: true }),
    };
  }

  /** Database configuration */
  get database() {
    return {
      url: this.configService.get('DATABASE_URL', { infer: true }),
    };
  }

  /** Redis configuration */
  get redis() {
    return {
      host: this.configService.get('REDIS_HOST', { infer: true }),
      port: this.configService.get('REDIS_PORT', { infer: true }),
      password: this.configService.get('REDIS_PASSWORD', { infer: true }),
      db: this.configService.get('REDIS_DB', { infer: true }),
    };
  }

  /** Auth configuration */
  get auth() {
    return {
      jwtAccessSecret: this.configService.get('JWT_ACCESS_SECRET', { infer: true }),
      jwtAccessExpiration: this.configService.get('JWT_ACCESS_EXPIRATION', { infer: true }),
      jwtRefreshSecret: this.configService.get('JWT_REFRESH_SECRET', { infer: true }),
      jwtRefreshExpiration: this.configService.get('JWT_REFRESH_EXPIRATION', { infer: true }),
      apiKeyEncryptionSecret: this.configService.get('API_KEY_ENCRYPTION_SECRET', { infer: true }),
      bcryptRounds: this.configService.get('BCRYPT_ROUNDS', { infer: true }),
    };
  }

  /** OpenTelemetry configuration */
  get otel() {
    return {
      enabled: this.configService.get('OTEL_ENABLED', { infer: true }),
      serviceName: this.configService.get('OTEL_SERVICE_NAME', { infer: true }),
      exporterEndpoint: this.configService.get('OTEL_EXPORTER_OTLP_ENDPOINT', { infer: true }),
      exporterProtocol: this.configService.get('OTEL_EXPORTER_OTLP_PROTOCOL', { infer: true }),
    };
  }

  /** Rate limiting configuration */
  get throttle() {
    return {
      ttl: this.configService.get('THROTTLE_TTL', { infer: true }),
      limit: this.configService.get('THROTTLE_LIMIT', { infer: true }),
    };
  }

  /** CORS configuration */
  get cors() {
    return {
      origins: this.configService.get('CORS_ORIGINS', { infer: true }).split(',').map((s: string) => s.trim()),
    };
  }

  /** Shutdown configuration */
  get shutdown() {
    return {
      timeoutMs: this.configService.get('SHUTDOWN_TIMEOUT_MS', { infer: true }),
    };
  }

  /** Full API path prefix (e.g., 'api/v1') */
  get apiPath(): string {
    return `${this.app.apiPrefix}/${this.app.apiVersion}`;
  }

  /** Environment check helpers */
  get isDevelopment(): boolean {
    return this.app.nodeEnv === 'development';
  }

  get isProduction(): boolean {
    return this.app.nodeEnv === 'production';
  }

  get isTest(): boolean {
    return this.app.nodeEnv === 'test';
  }
}
```

- [ ] **Step 3: Write `src/config/config.module.ts`**

```typescript
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppConfigService } from './config.service';
import { validateEnvConfig } from './schemas/env.schema';

/**
 * Global configuration module.
 * Validates all environment variables at startup using Zod.
 * Provides AppConfigService for type-safe config access.
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        `.env.${process.env.NODE_ENV || 'development'}.local`,
        `.env.${process.env.NODE_ENV || 'development'}`,
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
```

- [ ] **Step 4: Commit**

```bash
git add src/config/
git commit -m "feat: add Zod-validated config module with type-safe AppConfigService"
```

---

## Task 5: Logger Module

**Files:**
- Create: `src/logger/logger.interfaces.ts`
- Create: `src/logger/logger.constants.ts`
- Create: `src/logger/utils/sanitizer.util.ts`
- Create: `src/logger/utils/trace-context.util.ts`
- Create: `src/logger/logger.config.ts`
- Create: `src/logger/logger.service.ts`
- Create: `src/logger/logger.module.ts`

- [ ] **Step 1: Write `src/logger/logger.interfaces.ts`**

```typescript
/**
 * Logger interfaces — single source of truth for all logging contracts.
 * All logger implementations MUST satisfy IAppLogger.
 */

/** Allowed log attribute values — no `any` */
export type LogAttributeValue = string | number | boolean | string[] | number[];

/** Strongly typed log attributes */
export type LogAttributes = Record<string, LogAttributeValue>;

/** Log levels aligned with Pino and OTel severity */
export enum LogLevel {
  TRACE = 'trace',
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
}

/**
 * Base log options — every log method extends this.
 * Single source of truth for all logging configuration.
 */
export interface ILogOptions {
  /** Log level override. Default varies by method. */
  level?: LogLevel;

  /**
   * Kill switch. When false, method is a no-op (zero cost).
   * Useful for high-frequency paths or feature-flagged logging.
   * @default true
   */
  enabled?: boolean;

  /**
   * Structured key-value pairs attached to both Pino log AND OTel span.
   * Strongly typed — no `any`.
   */
  attributes?: LogAttributes;

  /**
   * When true, attributes are ONLY added to OTel span, NOT written to Pino log.
   * Useful for high-cardinality data that bloats log storage.
   * @default false
   */
  spanOnly?: boolean;

  /**
   * When true, attributes are ONLY written to Pino log, NOT added to OTel span.
   * Useful for debug context that shouldn't pollute traces.
   * @default false
   */
  logOnly?: boolean;
}

/** Options for logEvent — business events */
export interface ILogEventOptions extends ILogOptions {
  /** Default level: INFO */
  level?: LogLevel;
}

/** Options for logError — error events */
export interface ILogErrorOptions extends ILogOptions {
  /** Default level: ERROR */
  level?: LogLevel;

  /**
   * When true, records the error as an OTel span exception event.
   * @default true
   */
  recordException?: boolean;
}

/**
 * Core logger interface.
 * All custom logger implementations MUST satisfy this contract.
 */
export interface IAppLogger {
  /** General-purpose structured log */
  log(message: string, options?: ILogOptions): void;

  /** Business event — meaningful domain occurrence */
  logEvent(eventName: string, options?: ILogEventOptions): void;

  /** Error event — error with full context */
  logError(eventName: string, error: Error, options?: ILogErrorOptions): void;

  /** Enrich active OTel span without logging */
  addSpanAttributes(attributes: LogAttributes): void;

  /** Create a child logger with persistent context */
  child(context: LogAttributes): IAppLogger;
}
```

- [ ] **Step 2: Write `src/logger/logger.constants.ts`**

```typescript
import { LogLevel } from './logger.interfaces';

/**
 * Pino log level to numeric value mapping.
 * Must stay in sync with Pino's level values.
 */
export const PINO_LEVEL_VALUES: Record<LogLevel, number> = {
  [LogLevel.TRACE]: 10,
  [LogLevel.DEBUG]: 20,
  [LogLevel.INFO]: 30,
  [LogLevel.WARN]: 40,
  [LogLevel.ERROR]: 50,
  [LogLevel.FATAL]: 60,
};

/**
 * OTel severity number mapping.
 * Reference: https://opentelemetry.io/docs/specs/otel/logs/data-model/#field-severitynumber
 */
export const OTEL_SEVERITY_MAP: Record<LogLevel, number> = {
  [LogLevel.TRACE]: 1,
  [LogLevel.DEBUG]: 5,
  [LogLevel.INFO]: 9,
  [LogLevel.WARN]: 13,
  [LogLevel.ERROR]: 17,
  [LogLevel.FATAL]: 21,
};

/**
 * Pino redaction paths — sensitive fields that MUST be masked in logs.
 * Centralized here as single source of truth.
 * Add new paths here when new sensitive fields are introduced.
 */
export const REDACT_PATHS: readonly string[] = [
  // Request headers
  'req.headers.authorization',
  'req.headers["x-api-key"]',
  'req.headers.cookie',

  // Request body fields
  'body.password',
  'body.passwordHash',
  'body.currentPassword',
  'body.newPassword',
  'body.token',
  'body.refreshToken',
  'body.accessToken',

  // PII fields
  'body.ssn',
  'body.socialSecurityNumber',
  'body.cardNumber',
  'body.cvv',
  'body.creditCard',

  // Response fields (in case of accidental inclusion)
  'res.headers["set-cookie"]',
];

/** Redaction censor value */
export const REDACT_CENSOR = '[REDACTED]';

/** Maximum depth for attribute serialization */
export const MAX_SERIALIZATION_DEPTH = 5;

/** Maximum string length for attribute values in serialization */
export const MAX_ATTRIBUTE_STRING_LENGTH = 1024;
```

- [ ] **Step 3: Write `src/logger/utils/sanitizer.util.ts`**

```typescript
import {
  MAX_SERIALIZATION_DEPTH,
  MAX_ATTRIBUTE_STRING_LENGTH,
} from '../logger.constants';
import type { LogAttributes, LogAttributeValue } from '../logger.interfaces';

/**
 * Safely serializes log attributes with circular reference protection
 * and depth limiting.
 */
export function sanitizeAttributes(
  attributes: LogAttributes,
  maxDepth: number = MAX_SERIALIZATION_DEPTH,
): Record<string, LogAttributeValue> {
  const seen = new WeakSet<object>();
  const result: Record<string, LogAttributeValue> = {};

  for (const [key, value] of Object.entries(attributes)) {
    result[key] = sanitizeValue(value, seen, 0, maxDepth);
  }

  return result;
}

/**
 * Sanitizes a single attribute value.
 * Handles circular references, depth limits, and type coercion.
 */
function sanitizeValue(
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
  maxDepth: number,
): LogAttributeValue {
  // Null/undefined → empty string
  if (value === null || value === undefined) {
    return '';
  }

  // Primitive types pass through
  if (typeof value === 'string') {
    return value.length > MAX_ATTRIBUTE_STRING_LENGTH
      ? value.slice(0, MAX_ATTRIBUTE_STRING_LENGTH) + '...[truncated]'
      : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  // Arrays of primitives
  if (Array.isArray(value)) {
    return value.map(item => {
      if (typeof item === 'string' || typeof item === 'number') {
        return item;
      }
      return String(item);
    }) as string[] | number[];
  }

  // Objects (including Error)
  if (typeof value === 'object') {
    if (depth >= maxDepth) {
      return '[max depth reached]';
    }

    if (seen.has(value)) {
      return '[circular reference]';
    }

    seen.add(value);

    // Special handling for Error objects
    if (value instanceof Error) {
      return `${value.name}: ${value.message}`;
    }

    // Convert object to string representation
    try {
      return JSON.stringify(value);
    } catch {
      return '[unserializable object]';
    }
  }

  return String(value);
}

/**
 * Extracts safe, structured information from an Error object.
 * Used for OTel span exception recording.
 */
export function extractErrorInfo(error: Error): Record<string, string> {
  return {
    'error.type': error.constructor.name,
    'error.message': error.message,
    ...(error.stack ? { 'error.stack': error.stack } : {}),
  };
}
```

- [ ] **Step 4: Write `src/logger/utils/trace-context.util.ts`**

```typescript
import { v4 as uuidV4 } from 'uuid';

/** Trace context extracted from request headers */
export interface TraceContext {
  traceId: string;
  spanId: string;
  requestId: string;
}

/** Valid hex character pattern for trace/span IDs */
const HEX_PATTERN = /^[0-9a-f]+$/;

/**
 * Extracts trace context from request headers.
 * Supports W3C TraceContext and B3 propagation formats.
 * Falls back to generated UUIDs if no trace context is found.
 */
export function extractTraceContext(headers: Record<string, string | undefined>): TraceContext {
  const requestId = extractRequestId(headers);

  // Try W3C TraceContext (traceparent header)
  const w3c = parseW3CTraceParent(headers['traceparent']);
  if (w3c) {
    return { ...w3c, requestId };
  }

  // Try B3 single header
  const b3Single = parseB3SingleHeader(headers['b3']);
  if (b3Single) {
    return { ...b3Single, requestId };
  }

  // Try B3 multi-header
  const b3Multi = parseB3MultiHeader(headers);
  if (b3Multi) {
    return { ...b3Multi, requestId };
  }

  // Fallback: generate IDs
  return {
    traceId: uuidV4().replace(/-/g, ''),
    spanId: uuidV4().replace(/-/g, '').slice(0, 16),
    requestId,
  };
}

/** Extracts or generates a request ID from headers */
function extractRequestId(headers: Record<string, string | undefined>): string {
  return headers['x-request-id'] ?? uuidV4();
}

/**
 * Parses W3C TraceContext traceparent header.
 * Format: {version}-{trace-id}-{parent-id}-{trace-flags}
 * Example: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
 */
function parseW3CTraceParent(
  header: string | undefined,
): { traceId: string; spanId: string } | null {
  if (!header) return null;

  const parts = header.split('-');
  if (parts.length !== 4) return null;

  const [, traceId, spanId] = parts;

  if (!isValidHexId(traceId, 32) || !isValidHexId(spanId, 16)) {
    return null;
  }

  return { traceId, spanId };
}

/**
 * Parses B3 single header.
 * Format: {TraceId}-{SpanId}-{SamplingState}-{ParentSpanId}
 */
function parseB3SingleHeader(
  header: string | undefined,
): { traceId: string; spanId: string } | null {
  if (!header) return null;

  const parts = header.split('-');
  if (parts.length < 2) return null;

  const [traceId, spanId] = parts;

  if (!isValidHexId(traceId, 32) || !isValidHexId(spanId, 16)) {
    return null;
  }

  return { traceId, spanId };
}

/**
 * Parses B3 multi-header format.
 * Headers: X-B3-TraceId, X-B3-SpanId
 */
function parseB3MultiHeader(
  headers: Record<string, string | undefined>,
): { traceId: string; spanId: string } | null {
  const traceId = headers['x-b3-traceid'];
  const spanId = headers['x-b3-spanid'];

  if (!traceId || !spanId) return null;
  if (!isValidHexId(traceId, 32) || !isValidHexId(spanId, 16)) return null;

  return { traceId, spanId };
}

/** Validates that a string is a valid hex ID of the expected length */
function isValidHexId(id: string, expectedLength: number): boolean {
  return id.length === expectedLength && HEX_PATTERN.test(id);
}
```

- [ ] **Step 5: Write `src/logger/logger.config.ts`**

```typescript
import type { Params as PinoParams } from 'nestjs-pino';
import { REDACT_PATHS, REDACT_CENSOR } from './logger.constants';

/**
 * Creates Pino configuration for nestjs-pino.
 * Handles redaction, transport (pretty-print vs JSON), and format.
 */
export function createPinoConfig(options: {
  level: string;
  serviceName: string;
  isDevelopment: boolean;
}): PinoParams {
  const { level, serviceName, isDevelopment } = options;

  return {
    pinoHttp: {
      level,
      redact: {
        paths: [...REDACT_PATHS],
        censor: REDACT_CENSOR,
      },
      ...(isDevelopment
        ? {
            transport: {
              target: 'pino-pretty',
              options: {
                colorize: true,
                singleLine: false,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
              },
            },
          }
        : {
            // Production: structured JSON output
            formatters: {
              level: (label: string) => ({ level: label }),
              log: (object: Record<string, unknown>) => ({
                ...object,
                service: serviceName,
              }),
            },
          }),
      // Serializers for request/response
      serializers: {
        req: (req: Record<string, unknown>) => ({
          method: req.method,
          url: req.url,
          headers: {
            'user-agent': (req.headers as Record<string, string>)?.['user-agent'],
            'content-type': (req.headers as Record<string, string>)?.['content-type'],
          },
        }),
        res: (res: Record<string, unknown>) => ({
          statusCode: res.statusCode,
        }),
      },
      // Custom properties added to every log line
      customProps: () => ({
        service: serviceName,
      }),
    },
  };
}
```

- [ ] **Step 6: Write `src/logger/logger.service.ts`**

```typescript
import { Injectable, LoggerService, Scope } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { trace, SpanStatusCode, context as otelContext } from '@opentelemetry/api';
import type {
  IAppLogger,
  ILogOptions,
  ILogEventOptions,
  ILogErrorOptions,
  LogAttributes,
  LogAttributeValue,
} from './logger.interfaces';
import { LogLevel } from './logger.interfaces';
import { sanitizeAttributes, extractErrorInfo } from './utils/sanitizer.util';

/**
 * Application logger that implements IAppLogger.
 * Wraps Pino for structured logging and integrates with OTel for span enrichment.
 *
 * Features:
 * - Configurable log level per call
 * - Kill switch (enabled: false) for zero-cost no-op
 * - spanOnly/logOnly routing control
 * - Child loggers with persistent context
 * - Safe attribute serialization with circular ref protection
 *
 * Replaces NestJS default logger via app.useLogger().
 */
@Injectable()
export class AppLogger implements IAppLogger, LoggerService {
  private logContext?: string;
  private persistentAttributes: LogAttributes = {};

  constructor(private readonly pino: PinoLogger) {}

  /** Set the logger context (typically the class name) */
  setContext(context: string): void {
    this.logContext = context;
    this.pino.setContext(context);
  }

  /**
   * General-purpose structured log.
   * Writes to Pino and optionally enriches the active OTel span.
   */
  log(message: string, options?: ILogOptions): void {
    if (options?.enabled === false) return;

    const level = options?.level ?? LogLevel.INFO;
    const mergedAttrs = this.mergeAttributes(options?.attributes);

    if (!options?.spanOnly) {
      this.writeToPino(level, message, mergedAttrs);
    }

    if (!options?.logOnly) {
      this.addToActiveSpan(mergedAttrs);
    }
  }

  /**
   * Business event — a meaningful domain occurrence.
   * Adds an OTel span event AND writes a Pino structured log.
   */
  logEvent(eventName: string, options?: ILogEventOptions): void {
    if (options?.enabled === false) return;

    const level = options?.level ?? LogLevel.INFO;
    const mergedAttrs = this.mergeAttributes(options?.attributes);

    if (!options?.spanOnly) {
      this.writeToPino(level, eventName, mergedAttrs);
    }

    if (!options?.logOnly) {
      const span = trace.getActiveSpan();
      if (span) {
        const safeAttrs = mergedAttrs
          ? sanitizeAttributes(mergedAttrs)
          : undefined;
        span.addEvent(eventName, safeAttrs as Record<string, string | number | boolean>);
      }
    }
  }

  /**
   * Error event — an error with full context.
   * Records exception on active OTel span and writes to Pino.
   */
  logError(eventName: string, error: Error, options?: ILogErrorOptions): void {
    if (options?.enabled === false) return;

    const level = options?.level ?? LogLevel.ERROR;
    const mergedAttrs = this.mergeAttributes(options?.attributes);
    const errorInfo = extractErrorInfo(error);

    if (!options?.spanOnly) {
      this.writeToPino(level, eventName, { ...mergedAttrs, ...errorInfo });
    }

    if (!options?.logOnly) {
      const span = trace.getActiveSpan();
      if (span) {
        const shouldRecordException = options?.recordException !== false;
        if (shouldRecordException) {
          span.recordException(error);
          span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        }

        if (mergedAttrs) {
          const safeAttrs = sanitizeAttributes(mergedAttrs);
          span.setAttributes(safeAttrs as Record<string, string | number | boolean>);
        }
      }
    }
  }

  /**
   * Enrich the active OTel span without writing to Pino.
   * Pure span enrichment for trace-level context.
   */
  addSpanAttributes(attributes: LogAttributes): void {
    const span = trace.getActiveSpan();
    if (span) {
      const safeAttrs = sanitizeAttributes(attributes);
      span.setAttributes(safeAttrs as Record<string, string | number | boolean>);
    }
  }

  /**
   * Create a child logger with persistent context.
   * All logs from the child include the parent's context attributes.
   */
  child(childContext: LogAttributes): AppLogger {
    const childLogger = new AppLogger(this.pino);
    childLogger.logContext = this.logContext;
    childLogger.persistentAttributes = {
      ...this.persistentAttributes,
      ...childContext,
    };
    return childLogger;
  }

  // === NestJS LoggerService contract methods ===

  /** NestJS LoggerService: verbose */
  verbose(message: string, ...optionalParams: unknown[]): void {
    this.pino.trace({ context: this.resolveContext(optionalParams) }, message);
  }

  /** NestJS LoggerService: debug */
  debug(message: string, ...optionalParams: unknown[]): void {
    this.pino.debug({ context: this.resolveContext(optionalParams) }, message);
  }

  /** NestJS LoggerService: warn */
  warn(message: string, ...optionalParams: unknown[]): void {
    this.pino.warn({ context: this.resolveContext(optionalParams) }, message);
  }

  /** NestJS LoggerService: error */
  error(message: string, ...optionalParams: unknown[]): void {
    this.pino.error({ context: this.resolveContext(optionalParams) }, message);
  }

  /** NestJS LoggerService: fatal */
  fatal(message: string, ...optionalParams: unknown[]): void {
    this.pino.fatal({ context: this.resolveContext(optionalParams) }, message);
  }

  // === Private helpers ===

  /** Merges persistent attributes with call-specific attributes */
  private mergeAttributes(callAttrs?: LogAttributes): LogAttributes | undefined {
    if (!callAttrs && Object.keys(this.persistentAttributes).length === 0) {
      return undefined;
    }

    return {
      ...this.persistentAttributes,
      ...callAttrs,
    };
  }

  /** Writes a structured log entry to Pino at the specified level */
  private writeToPino(
    level: LogLevel,
    message: string,
    attributes?: LogAttributes,
  ): void {
    const logData = {
      ...(attributes ? sanitizeAttributes(attributes) : {}),
      context: this.logContext,
    };

    switch (level) {
      case LogLevel.TRACE:
        this.pino.trace(logData, message);
        break;
      case LogLevel.DEBUG:
        this.pino.debug(logData, message);
        break;
      case LogLevel.INFO:
        this.pino.info(logData, message);
        break;
      case LogLevel.WARN:
        this.pino.warn(logData, message);
        break;
      case LogLevel.ERROR:
        this.pino.error(logData, message);
        break;
      case LogLevel.FATAL:
        this.pino.fatal(logData, message);
        break;
    }
  }

  /** Adds attributes to the active OTel span if one exists */
  private addToActiveSpan(attributes?: LogAttributes): void {
    if (!attributes) return;

    const span = trace.getActiveSpan();
    if (span) {
      const safeAttrs = sanitizeAttributes(attributes);
      span.setAttributes(safeAttrs as Record<string, string | number | boolean>);
    }
  }

  /** Resolves context from NestJS LoggerService optional params */
  private resolveContext(optionalParams: unknown[]): string | undefined {
    const lastParam = optionalParams[optionalParams.length - 1];
    if (typeof lastParam === 'string') {
      return lastParam;
    }
    return this.logContext;
  }
}
```

- [ ] **Step 7: Write `src/logger/logger.module.ts`**

```typescript
import { Global, Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { AppConfigService } from '@config/config.service';
import { AppLogger } from './logger.service';
import { createPinoConfig } from './logger.config';

/**
 * Global logger module.
 * Configures Pino via nestjs-pino and provides AppLogger.
 * Replaces NestJS default logger when app.useLogger(appLogger) is called in main.ts.
 */
@Global()
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => {
        return createPinoConfig({
          level: config.app.logLevel,
          serviceName: config.app.name,
          isDevelopment: config.isDevelopment,
        });
      },
    }),
  ],
  providers: [AppLogger],
  exports: [AppLogger],
})
export class AppLoggerModule {}
```

- [ ] **Step 8: Commit**

```bash
git add src/logger/
git commit -m "feat: add logger module with AppLogger, Pino config, redaction, sanitizer, trace context"
```

---

## Task 6: Database Module (Prisma)

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/database/prisma.service.ts`
- Create: `src/database/prisma.module.ts`
- Create: `src/database/repositories/base.repository.ts`

- [ ] **Step 1: Write `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// === Enums ===

enum UserStatus {
  ACTIVE
  SUSPENDED
  PENDING_VERIFICATION
}

enum UserRole {
  USER
  ADMIN
}

enum ApiKeyStatus {
  ACTIVE
  REVOKED
}

enum TodoStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
  ARCHIVED
}

enum TodoPriority {
  LOW
  MEDIUM
  HIGH
  URGENT
}

// === Models ===

model User {
  id               String     @id @default(uuid())
  email            String     @unique
  passwordHash     String
  firstName        String?
  lastName         String?
  role             UserRole   @default(USER)
  status           UserStatus @default(PENDING_VERIFICATION)
  lockedUntil      DateTime?
  failedLoginCount Int        @default(0)
  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt
  deletedAt        DateTime?

  refreshTokens RefreshToken[]
  apiKeys       ApiKey[]
  todoLists     TodoList[]

  @@map("users")
}

model RefreshToken {
  id        String    @id @default(uuid())
  token     String    @unique
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())

  @@index([userId])
  @@map("refresh_tokens")
}

model ApiKey {
  id         String       @id @default(uuid())
  name       String
  keyHash    String       @unique
  prefix     String
  userId     String
  user       User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  status     ApiKeyStatus @default(ACTIVE)
  lastUsedAt DateTime?
  expiresAt  DateTime?
  createdAt  DateTime     @default(now())

  @@index([userId])
  @@map("api_keys")
}

model TodoList {
  id          String    @id @default(uuid())
  title       String
  description String?
  userId      String
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?

  items TodoItem[]

  @@index([userId])
  @@map("todo_lists")
}

model TodoItem {
  id          String       @id @default(uuid())
  title       String
  description String?
  status      TodoStatus   @default(PENDING)
  priority    TodoPriority @default(MEDIUM)
  dueDate     DateTime?
  completedAt DateTime?
  todoListId  String
  todoList    TodoList     @relation(fields: [todoListId], references: [id], onDelete: Cascade)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  deletedAt   DateTime?

  tags TodoItemTag[]

  @@index([todoListId])
  @@index([status])
  @@index([priority])
  @@index([dueDate])
  @@map("todo_items")
}

model Tag {
  id        String   @id @default(uuid())
  name      String   @unique
  color     String?
  createdAt DateTime @default(now())

  items TodoItemTag[]

  @@map("tags")
}

model TodoItemTag {
  todoItemId String
  tagId      String
  todoItem   TodoItem @relation(fields: [todoItemId], references: [id], onDelete: Cascade)
  tag        Tag      @relation(fields: [tagId], references: [id], onDelete: Cascade)
  assignedAt DateTime @default(now())

  @@id([todoItemId, tagId])
  @@map("todo_item_tags")
}
```

- [ ] **Step 2: Generate Prisma client**

```bash
npx prisma generate
```

- [ ] **Step 3: Write `src/database/prisma.service.ts`**

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppLogger } from '@logger/logger.service';
import { LogLevel } from '@logger/logger.interfaces';

/**
 * Prisma service — manages database connection lifecycle.
 * Extends PrismaClient for direct query access.
 * Provides health check and connection status methods.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly logger: AppLogger) {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
    });
    this.logger.setContext(PrismaService.name);
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.logEvent('database.connected', {
      level: LogLevel.INFO,
      attributes: { provider: 'postgresql' },
    });

    // Log query events in development
    this.$on('query' as never, (event: { query: string; duration: number }) => {
      this.logger.log('database.query', {
        level: LogLevel.DEBUG,
        attributes: {
          query: event.query,
          duration: event.duration,
        },
        logOnly: true,
      });
    });

    this.$on('error' as never, (event: { message: string }) => {
      this.logger.logError('database.error', new Error(event.message));
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.logEvent('database.disconnected', {
      level: LogLevel.INFO,
    });
  }

  /**
   * Health check — verifies database connectivity.
   * Returns true if a simple query succeeds.
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 4: Write `src/database/prisma.module.ts`**

```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global database module.
 * Provides PrismaService for database access across all modules.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
```

- [ ] **Step 5: Write `src/database/repositories/base.repository.ts`**

```typescript
import { PrismaService } from '@database/prisma.service';
import type { PaginationParams, PaginatedResult, PaginationMeta } from '@common/interfaces';
import { DEFAULT_PAGE, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '@common/constants';

/**
 * Generic base repository providing CRUD operations with pagination and soft-delete.
 * Extend this class for each Prisma model to get standardized data access.
 *
 * @template TModel - The Prisma model type (e.g., User, TodoList)
 * @template TCreateInput - The create input type
 * @template TUpdateInput - The update input type
 * @template TWhereUniqueInput - The unique where input type
 * @template TWhereInput - The where filter input type
 * @template TOrderByInput - The order by input type
 */
export abstract class BaseRepository<
  TModel,
  TCreateInput,
  TUpdateInput,
  TWhereUniqueInput,
  TWhereInput,
  TOrderByInput,
> {
  constructor(protected readonly prisma: PrismaService) {}

  /**
   * Returns the Prisma delegate for the model.
   * Each subclass must implement this to provide the correct delegate.
   */
  protected abstract get delegate(): {
    create(args: { data: TCreateInput }): Promise<TModel>;
    findUnique(args: { where: TWhereUniqueInput; include?: Record<string, boolean> }): Promise<TModel | null>;
    findFirst(args: { where: TWhereInput }): Promise<TModel | null>;
    findMany(args: { where?: TWhereInput; orderBy?: TOrderByInput; skip?: number; take?: number; include?: Record<string, boolean> }): Promise<TModel[]>;
    update(args: { where: TWhereUniqueInput; data: TUpdateInput }): Promise<TModel>;
    delete(args: { where: TWhereUniqueInput }): Promise<TModel>;
    count(args: { where?: TWhereInput }): Promise<number>;
  };

  /** Whether this model supports soft-delete (has deletedAt field) */
  protected readonly supportsSoftDelete: boolean = false;

  /** Create a new record */
  async create(data: TCreateInput): Promise<TModel> {
    return this.delegate.create({ data });
  }

  /** Find a unique record by its unique identifier */
  async findUnique(where: TWhereUniqueInput, include?: Record<string, boolean>): Promise<TModel | null> {
    return this.delegate.findUnique({ where, include });
  }

  /** Find the first record matching the filter */
  async findFirst(where: TWhereInput): Promise<TModel | null> {
    return this.delegate.findFirst({ where });
  }

  /** Find multiple records with optional filtering and ordering */
  async findMany(
    where?: TWhereInput,
    orderBy?: TOrderByInput,
    include?: Record<string, boolean>,
  ): Promise<TModel[]> {
    return this.delegate.findMany({ where, orderBy, include });
  }

  /**
   * Find multiple records with pagination.
   * Returns data and pagination metadata.
   */
  async findManyPaginated(
    params: PaginationParams,
    where?: TWhereInput,
    orderBy?: TOrderByInput,
    include?: Record<string, boolean>,
  ): Promise<PaginatedResult<TModel>> {
    const page = Math.max(params.page ?? DEFAULT_PAGE, 1);
    const limit = Math.min(Math.max(params.limit ?? DEFAULT_PAGE_LIMIT, 1), MAX_PAGE_LIMIT);
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.delegate.findMany({ where, orderBy, skip, take: limit, include }),
      this.delegate.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);
    const meta: PaginationMeta = {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };

    return { data, meta };
  }

  /** Update a record by its unique identifier */
  async update(where: TWhereUniqueInput, data: TUpdateInput): Promise<TModel> {
    return this.delegate.update({ where, data });
  }

  /** Hard-delete a record */
  async delete(where: TWhereUniqueInput): Promise<TModel> {
    return this.delegate.delete({ where });
  }

  /**
   * Soft-delete a record by setting deletedAt to the current timestamp.
   * Only works if supportsSoftDelete is true.
   */
  async softDelete(where: TWhereUniqueInput): Promise<TModel> {
    return this.delegate.update({
      where,
      data: { deletedAt: new Date() } as unknown as TUpdateInput,
    });
  }

  /**
   * Restore a soft-deleted record by setting deletedAt to null.
   * Only works if supportsSoftDelete is true.
   */
  async restore(where: TWhereUniqueInput): Promise<TModel> {
    return this.delegate.update({
      where,
      data: { deletedAt: null } as unknown as TUpdateInput,
    });
  }

  /** Count records matching the filter */
  async count(where?: TWhereInput): Promise<number> {
    return this.delegate.count({ where });
  }

  /** Check if a record exists matching the filter */
  async exists(where: TWhereInput): Promise<boolean> {
    const count = await this.delegate.count({ where });
    return count > 0;
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add prisma/ src/database/
git commit -m "feat: add Prisma schema, database module, and generic base repository"
```

---

## Task 7: Common Middleware, Pipes, Decorators

**Files:**
- Create: `src/common/decorators/public.decorator.ts`
- Create: `src/common/middleware/request-id.middleware.ts`
- Create: `src/common/middleware/security-headers.middleware.ts`
- Create: `src/common/pipes/zod-validation.pipe.ts`
- Create: `src/common/pipes/parse-uuid.pipe.ts`

- [ ] **Step 1: Write `src/common/decorators/public.decorator.ts`**

```typescript
import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '@common/constants';

/**
 * Marks a route as public — bypasses JWT authentication.
 * Use on controller methods that should be accessible without auth.
 *
 * @example
 * @Public()
 * @Get('health')
 * getHealth() { ... }
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

- [ ] **Step 2: Write `src/common/middleware/request-id.middleware.ts`**

```typescript
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidV4 } from 'uuid';
import { REQUEST_ID_HEADER } from '@common/constants';

/**
 * Extracts or generates a unique request ID.
 * Attaches to request object and response headers for correlation.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = (req.headers[REQUEST_ID_HEADER] as string) ?? uuidV4();

    // Attach to request for downstream access
    (req as Request & { id: string }).id = requestId;

    // Echo in response headers for client-side correlation
    res.setHeader(REQUEST_ID_HEADER, requestId);

    next();
  }
}
```

- [ ] **Step 3: Write `src/common/middleware/security-headers.middleware.ts`**

```typescript
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Adds additional security headers beyond what Helmet provides.
 * Complements Helmet with application-specific headers.
 */
@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  use(_req: Request, res: Response, next: NextFunction): void {
    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');

    // Enable XSS protection
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Control referrer information
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Restrict permissions
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    next();
  }
}
```

- [ ] **Step 4: Write `src/common/pipes/zod-validation.pipe.ts`**

```typescript
import { PipeTransform, Injectable } from '@nestjs/common';
import { ZodSchema, ZodError } from 'zod';
import { ErrorFactory } from '@errors/types/error-factory';

/**
 * Validation pipe that validates input against a Zod schema.
 * Use with @UsePipes() or as a parameter decorator.
 *
 * @example
 * @UsePipes(new ZodValidationPipe(createTodoSchema))
 * create(@Body() dto: CreateTodoDto) { ... }
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw ErrorFactory.fromZodErrors(result.error);
    }

    return result.data;
  }
}
```

- [ ] **Step 5: Write `src/common/pipes/parse-uuid.pipe.ts`**

```typescript
import { PipeTransform, Injectable } from '@nestjs/common';
import { ErrorFactory } from '@errors/types/error-factory';

/** UUID v4 regex pattern */
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates that a parameter is a valid UUID v4.
 * Throws AppError with VAL0001 if invalid.
 *
 * @example
 * @Get(':id')
 * findOne(@Param('id', ParseUuidPipe) id: string) { ... }
 */
@Injectable()
export class ParseUuidPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!UUID_V4_PATTERN.test(value)) {
      throw ErrorFactory.validation('Invalid UUID format', [
        { field: 'id', message: `'${value}' is not a valid UUID` },
      ]);
    }

    return value;
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/common/decorators/ src/common/middleware/ src/common/pipes/
git commit -m "feat: add public decorator, request-id/security middleware, zod/uuid pipes"
```

---

## Task 8: Global Filters & Interceptors

**Files:**
- Create: `src/common/filters/all-exceptions.filter.ts`
- Create: `src/common/filters/prisma-exception.filter.ts`
- Create: `src/common/interceptors/logging.interceptor.ts`
- Create: `src/common/interceptors/transform.interceptor.ts`
- Create: `src/common/interceptors/timeout.interceptor.ts`

- [ ] **Step 1: Write `src/common/filters/prisma-exception.filter.ts`**

```typescript
import { Catch, ExceptionFilter, ArgumentsHost } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { handlePrismaError, isPrismaError } from '@errors/handlers/prisma-error.handler';
import { AppError } from '@errors/types/app-error';

/**
 * Catches Prisma-specific exceptions and converts them to AppError.
 * Registered BEFORE AllExceptionsFilter so Prisma errors get proper codes.
 * Re-throws as AppError for AllExceptionsFilter to format the response.
 */
@Catch(
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientValidationError,
  Prisma.PrismaClientInitializationError,
  Prisma.PrismaClientRustPanicError,
  Prisma.PrismaClientUnknownRequestError,
)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Error, host: ArgumentsHost): void {
    const appError = handlePrismaError(exception);

    if (appError) {
      throw appError;
    }

    // Shouldn't reach here since we only catch Prisma errors
    throw AppError.wrap(exception);
  }
}
```

- [ ] **Step 2: Write `src/common/filters/all-exceptions.filter.ts`**

```typescript
import {
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppError } from '@errors/types/app-error';
import { ERROR_CODES } from '@common/constants';
import { AppLogger } from '@logger/logger.service';
import { LogLevel } from '@logger/logger.interfaces';
import { trace } from '@opentelemetry/api';
import type { ApiErrorResponse } from '@common/interfaces';

/**
 * Global exception filter — catches ALL unhandled exceptions.
 * Normalizes every error into the standard ApiErrorResponse format.
 * Logs errors with appropriate severity based on status code.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request & { id?: string }>();
    const response = ctx.getResponse<Response>();

    const appError = this.normalizeError(exception);
    const requestId = request.id;
    const traceId = trace.getActiveSpan()?.spanContext()?.traceId;

    // Log with appropriate level
    const logLevel = appError.statusCode >= 500 ? LogLevel.ERROR : LogLevel.WARN;
    this.logger.logError('http.error', appError.cause ?? appError, {
      level: logLevel,
      attributes: {
        'http.status_code': appError.statusCode,
        'error.code': appError.code,
        'http.method': request.method,
        'http.url': request.url,
        ...(requestId ? { 'request.id': requestId } : {}),
      },
    });

    const errorResponse: ApiErrorResponse = {
      success: false,
      error: appError.toResponse(requestId, traceId),
      timestamp: new Date().toISOString(),
    };

    response.status(appError.statusCode).json(errorResponse);
  }

  /** Normalizes any error type into an AppError */
  private normalizeError(exception: unknown): AppError {
    // Already an AppError — use as-is
    if (AppError.isAppError(exception)) {
      return exception;
    }

    // NestJS HttpException — map status code to error code
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const message = this.extractHttpExceptionMessage(exception);
      const code = this.statusToErrorCode(status);

      return new AppError(code, message, status, {
        cause: exception,
        isOperational: true,
      });
    }

    // Unknown error — wrap as internal
    return AppError.wrap(exception);
  }

  /** Extracts message from HttpException response */
  private extractHttpExceptionMessage(exception: HttpException): string {
    const response = exception.getResponse();

    if (typeof response === 'string') {
      return response;
    }

    if (typeof response === 'object' && response !== null) {
      const responseObj = response as Record<string, unknown>;
      if (typeof responseObj.message === 'string') {
        return responseObj.message;
      }
      if (Array.isArray(responseObj.message)) {
        return responseObj.message.join(', ');
      }
    }

    return exception.message;
  }

  /** Maps HTTP status codes to error code strings */
  private statusToErrorCode(status: number): string {
    const statusMap: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: ERROR_CODES.VAL0001.code,
      [HttpStatus.UNAUTHORIZED]: ERROR_CODES.AUT0001.code,
      [HttpStatus.FORBIDDEN]: ERROR_CODES.AUZ0001.code,
      [HttpStatus.NOT_FOUND]: ERROR_CODES.DAT0001.code,
      [HttpStatus.CONFLICT]: ERROR_CODES.DAT0002.code,
      [HttpStatus.TOO_MANY_REQUESTS]: ERROR_CODES.GEN0001.code,
      [HttpStatus.REQUEST_TIMEOUT]: ERROR_CODES.GEN0002.code,
      [HttpStatus.SERVICE_UNAVAILABLE]: ERROR_CODES.GEN0003.code,
    };

    return statusMap[status] ?? ERROR_CODES.SRV0001.code;
  }
}
```

- [ ] **Step 3: Write `src/common/interceptors/transform.interceptor.ts`**

```typescript
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { Request } from 'express';
import { trace } from '@opentelemetry/api';
import type { ApiSuccessResponse, ApiResponseMeta } from '@common/interfaces';
import type { PaginatedResult } from '@common/interfaces';

/**
 * Wraps all successful responses in the standard ApiSuccessResponse format.
 * Automatically detects paginated results and includes pagination metadata.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiSuccessResponse<T>> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiSuccessResponse<T>> {
    const request = context.switchToHttp().getRequest<Request & { id?: string }>();
    const requestId = request.id;
    const traceId = trace.getActiveSpan()?.spanContext()?.traceId;

    return next.handle().pipe(
      map(data => {
        const isPaginated = this.isPaginatedResult(data);

        const meta: ApiResponseMeta = {
          ...(isPaginated ? (data as PaginatedResult<unknown>).meta : {}),
          requestId,
          traceId,
        };

        return {
          success: true as const,
          data: isPaginated ? (data as PaginatedResult<unknown>).data as unknown as T : data,
          meta,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }

  /** Checks if the response data is a PaginatedResult */
  private isPaginatedResult(data: unknown): boolean {
    return (
      data !== null &&
      typeof data === 'object' &&
      'data' in data &&
      'meta' in data &&
      typeof (data as Record<string, unknown>).meta === 'object'
    );
  }
}
```

- [ ] **Step 4: Write `src/common/interceptors/logging.interceptor.ts`**

```typescript
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';
import { AppLogger } from '@logger/logger.service';
import { LogLevel } from '@logger/logger.interfaces';

/**
 * Logs every HTTP request and response with duration.
 * Adds request context to log entries for correlation.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLogger) {
    this.logger.setContext(LoggingInterceptor.name);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { id?: string }>();
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse<Response>();
          const duration = Date.now() - startTime;

          this.logger.logEvent('http.request.completed', {
            level: LogLevel.INFO,
            attributes: {
              'http.method': request.method,
              'http.url': request.url,
              'http.status_code': response.statusCode,
              'http.duration_ms': duration,
              ...(request.id ? { 'request.id': request.id } : {}),
            },
          });
        },
        error: (error: Error) => {
          const duration = Date.now() - startTime;

          this.logger.logError('http.request.failed', error, {
            level: LogLevel.ERROR,
            attributes: {
              'http.method': request.method,
              'http.url': request.url,
              'http.duration_ms': duration,
              ...(request.id ? { 'request.id': request.id } : {}),
            },
          });
        },
      }),
    );
  }
}
```

- [ ] **Step 5: Write `src/common/interceptors/timeout.interceptor.ts`**

```typescript
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, timeout, catchError, throwError, TimeoutError } from 'rxjs';
import { DEFAULT_REQUEST_TIMEOUT_MS } from '@common/constants';
import { ErrorFactory } from '@errors/types/error-factory';

/**
 * Enforces a maximum request timeout.
 * Throws GEN0002 (Request timeout) if the handler exceeds the limit.
 */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  private readonly timeoutMs: number;

  constructor(timeoutMs?: number) {
    this.timeoutMs = timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      timeout(this.timeoutMs),
      catchError(error => {
        if (error instanceof TimeoutError) {
          return throwError(() => ErrorFactory.rateLimited());
        }
        return throwError(() => error);
      }),
    );
  }
}
```

Note: The timeout interceptor throws `GEN0002` for timeouts — let me fix that:

Actually, looking at the error codes, `GEN0002` is "Request timeout" which is correct. But `ErrorFactory.rateLimited()` returns `GEN0001`. Let me correct:

```typescript
// In the catchError, replace:
return throwError(() => ErrorFactory.rateLimited());
// With:
return throwError(() => AppError.fromCode('GEN0002'));
```

- [ ] **Step 6: Commit**

```bash
git add src/common/filters/ src/common/interceptors/
git commit -m "feat: add global exception filters and interceptors (transform, logging, timeout)"
```

---

## Task 9: Bootstrap & Process Handlers

**Files:**
- Create: `src/bootstrap/process-handlers.constants.ts`
- Create: `src/bootstrap/process-handlers.ts`
- Create: `src/bootstrap/graceful-shutdown.ts`

- [ ] **Step 1: Write `src/bootstrap/process-handlers.constants.ts`**

```typescript
/** Exit code for successful graceful shutdown */
export const EXIT_CODE_SUCCESS = 0;

/** Exit code for uncaught exceptions */
export const EXIT_CODE_UNCAUGHT_EXCEPTION = 1;

/** Default hard exit timeout (fallback if SHUTDOWN_TIMEOUT_MS not configured) */
export const DEFAULT_HARD_EXIT_TIMEOUT_MS = 10_000;

/** Process signal names we handle */
export const HANDLED_SIGNALS = ['SIGTERM', 'SIGINT'] as const;

/** Process event types */
export const PROCESS_EVENT = {
  UNCAUGHT_EXCEPTION: 'uncaughtException',
  UNHANDLED_REJECTION: 'unhandledRejection',
  WARNING: 'warning',
} as const;
```

- [ ] **Step 2: Write `src/bootstrap/graceful-shutdown.ts`**

```typescript
import { INestApplication } from '@nestjs/common';
import { AppLogger } from '@logger/logger.service';
import { LogLevel } from '@logger/logger.interfaces';
import {
  EXIT_CODE_SUCCESS,
  DEFAULT_HARD_EXIT_TIMEOUT_MS,
} from './process-handlers.constants';

/**
 * Performs NestJS-aware graceful shutdown.
 * Closes the NestJS app (runs OnModuleDestroy hooks), then exits.
 */
export async function gracefulShutdown(
  app: INestApplication,
  logger: AppLogger,
  signal: string,
  timeoutMs: number = DEFAULT_HARD_EXIT_TIMEOUT_MS,
): Promise<void> {
  logger.logEvent('process.shutdown.started', {
    level: LogLevel.INFO,
    attributes: { signal, 'shutdown.timeout_ms': timeoutMs },
  });

  // Safety net: force exit if shutdown takes too long
  const hardExitTimer = setTimeout(() => {
    logger.logError(
      'process.shutdown.timeout',
      new Error(`Graceful shutdown timed out after ${timeoutMs}ms`),
      { level: LogLevel.FATAL },
    );
    process.exit(EXIT_CODE_SUCCESS);
  }, timeoutMs);

  // Don't let the timer keep the process alive
  hardExitTimer.unref();

  try {
    // Close NestJS app — triggers OnModuleDestroy hooks (Prisma disconnect, etc.)
    await app.close();

    logger.logEvent('process.shutdown.completed', {
      level: LogLevel.INFO,
      attributes: { signal },
    });
  } catch (error) {
    logger.logError(
      'process.shutdown.error',
      error instanceof Error ? error : new Error(String(error)),
      { level: LogLevel.ERROR },
    );
  } finally {
    clearTimeout(hardExitTimer);
    process.exit(EXIT_CODE_SUCCESS);
  }
}
```

- [ ] **Step 3: Write `src/bootstrap/process-handlers.ts`**

```typescript
import { INestApplication } from '@nestjs/common';
import { AppLogger } from '@logger/logger.service';
import { LogLevel } from '@logger/logger.interfaces';
import { gracefulShutdown } from './graceful-shutdown';
import {
  EXIT_CODE_UNCAUGHT_EXCEPTION,
  HANDLED_SIGNALS,
  PROCESS_EVENT,
} from './process-handlers.constants';

/**
 * Registers global process event handlers for signals and errors.
 * Must be called after the NestJS app is created and logger is available.
 */
export function setupProcessHandlers(
  app: INestApplication,
  logger: AppLogger,
  shutdownTimeoutMs: number,
): void {
  // === Graceful shutdown signals (SIGTERM, SIGINT) ===
  for (const signal of HANDLED_SIGNALS) {
    process.on(signal, () => {
      gracefulShutdown(app, logger, signal, shutdownTimeoutMs);
    });
  }

  // === Uncaught exceptions — fatal, must exit ===
  process.on(PROCESS_EVENT.UNCAUGHT_EXCEPTION, (error: Error) => {
    logger.logError('process.uncaught_exception', error, {
      level: LogLevel.FATAL,
      attributes: { 'error.type': error.constructor.name },
    });

    // Flush logs then exit
    setTimeout(() => {
      process.exit(EXIT_CODE_UNCAUGHT_EXCEPTION);
    }, 1000).unref();
  });

  // === Unhandled rejections — log but don't exit (recoverable) ===
  process.on(PROCESS_EVENT.UNHANDLED_REJECTION, (reason: unknown) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    logger.logError('process.unhandled_rejection', error, {
      level: LogLevel.ERROR,
      attributes: { 'error.type': error.constructor.name },
    });
  });

  // === Process warnings — informational ===
  process.on(PROCESS_EVENT.WARNING, (warning: Error) => {
    logger.logEvent('process.warning', {
      level: LogLevel.WARN,
      attributes: {
        'warning.name': warning.name,
        'warning.message': warning.message,
      },
    });
  });

  logger.logEvent('process.handlers.registered', {
    level: LogLevel.DEBUG,
    attributes: {
      signals: HANDLED_SIGNALS.join(', '),
      'shutdown.timeout_ms': shutdownTimeoutMs,
    },
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/bootstrap/
git commit -m "feat: add process handlers with graceful shutdown and signal handling"
```

---

## Task 10: Health Module

**Files:**
- Create: `src/modules/health/health.controller.ts`
- Create: `src/modules/health/health.service.ts`
- Create: `src/modules/health/health.module.ts`

- [ ] **Step 1: Write `src/modules/health/health.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma.service';

/** Health check result for a single component */
export interface ComponentHealth {
  status: 'up' | 'down';
  message?: string;
}

/** Comprehensive health check result */
export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  timestamp: string;
  components: Record<string, ComponentHealth>;
}

/**
 * Health service — checks connectivity of all infrastructure components.
 */
@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness check — is the process running? */
  isAlive(): { status: string } {
    return { status: 'ok' };
  }

  /** Readiness check — can the app serve traffic? */
  async isReady(): Promise<{ status: string }> {
    const dbHealthy = await this.prisma.isHealthy();
    if (!dbHealthy) {
      throw new Error('Database not ready');
    }
    return { status: 'ok' };
  }

  /** Comprehensive check — status of all components */
  async getHealth(): Promise<HealthCheckResult> {
    const components: Record<string, ComponentHealth> = {};

    // Database check
    try {
      const dbHealthy = await this.prisma.isHealthy();
      components.database = { status: dbHealthy ? 'up' : 'down' };
    } catch (error) {
      components.database = {
        status: 'down',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    // Determine overall status
    const allUp = Object.values(components).every(c => c.status === 'up');
    const allDown = Object.values(components).every(c => c.status === 'down');

    return {
      status: allUp ? 'healthy' : allDown ? 'unhealthy' : 'degraded',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      components,
    };
  }
}
```

- [ ] **Step 2: Write `src/modules/health/health.controller.ts`**

```typescript
import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { HealthService, HealthCheckResult } from './health.service';

/**
 * Health check endpoints for liveness, readiness, and comprehensive checks.
 * All endpoints are public (no auth required).
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /** Comprehensive health check — returns status of all components */
  @Public()
  @Get()
  @ApiOperation({ summary: 'Comprehensive health check' })
  @ApiResponse({ status: 200, description: 'Health check result' })
  async getHealth(): Promise<HealthCheckResult> {
    return this.healthService.getHealth();
  }

  /** Liveness probe — is the process running? */
  @Public()
  @Get('live')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiResponse({ status: 200, description: 'Process is alive' })
  isAlive(): { status: string } {
    return this.healthService.isAlive();
  }

  /** Readiness probe — can the app serve traffic? */
  @Public()
  @Get('ready')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Readiness probe' })
  @ApiResponse({ status: 200, description: 'App is ready' })
  @ApiResponse({ status: 503, description: 'App is not ready' })
  async isReady(): Promise<{ status: string }> {
    return this.healthService.isReady();
  }
}
```

- [ ] **Step 3: Write `src/modules/health/health.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
```

- [ ] **Step 4: Commit**

```bash
git add src/modules/health/
git commit -m "feat: add health module with liveness, readiness, and comprehensive checks"
```

---

## Task 11: App Module & Main Bootstrap

**Files:**
- Create: `src/app.module.ts`
- Create: `src/main.ts`

- [ ] **Step 1: Write `src/app.module.ts`**

```typescript
import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppConfigModule } from '@config/config.module';
import { AppConfigService } from '@config/config.service';
import { DatabaseModule } from '@database/prisma.module';
import { AppLoggerModule } from '@logger/logger.module';
import { HealthModule } from '@modules/health/health.module';
import { RequestIdMiddleware } from '@common/middleware/request-id.middleware';
import { SecurityHeadersMiddleware } from '@common/middleware/security-headers.middleware';

/**
 * Root application module.
 * Import order: Core → Infrastructure → Feature modules.
 */
@Module({
  imports: [
    // === Core ===
    AppConfigModule,
    AppLoggerModule,
    DatabaseModule,

    // === Rate limiting ===
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        throttlers: [
          {
            ttl: config.throttle.ttl,
            limit: config.throttle.limit,
          },
        ],
      }),
    }),

    // === Feature modules ===
    HealthModule,
  ],
  providers: [
    // Global throttler guard
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, SecurityHeadersMiddleware).forRoutes('*');
  }
}
```

- [ ] **Step 2: Write `src/main.ts`**

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
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

/**
 * Application bootstrap.
 * Each concern is a separate function following SRP.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(AppConfigService);
  const logger = app.get(AppLogger);

  // Use custom logger as the NestJS default
  app.useLogger(logger);
  logger.setContext('Bootstrap');

  // Apply global prefix (e.g., 'api/v1')
  app.setGlobalPrefix(config.apiPath);

  setupSecurity(app, config);
  setupGlobalPipes(app);
  setupGlobalFilters(app, logger);
  setupGlobalInterceptors(app, logger);
  setupSwagger(app, config, logger);
  setupProcessHandlers(app, logger, config.shutdown.timeoutMs);

  await startServer(app, config, logger);
}

/** Security: Helmet, CORS */
function setupSecurity(app: ReturnType<typeof NestFactory.create> extends Promise<infer T> ? T : never, config: AppConfigService): void {
  app.use(helmet());
  app.enableCors({
    origin: config.cors.origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', API_KEY_HEADER],
  });
}

/** Global validation pipe */
function setupGlobalPipes(app: ReturnType<typeof NestFactory.create> extends Promise<infer T> ? T : never): void {
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      enableImplicitConversion: true,
    }),
  );
}

/** Global exception filters — order matters (last registered runs first) */
function setupGlobalFilters(app: ReturnType<typeof NestFactory.create> extends Promise<infer T> ? T : never, logger: AppLogger): void {
  app.useGlobalFilters(
    new AllExceptionsFilter(logger),
    new PrismaExceptionFilter(),
  );
}

/** Global interceptors */
function setupGlobalInterceptors(app: ReturnType<typeof NestFactory.create> extends Promise<infer T> ? T : never, logger: AppLogger): void {
  app.useGlobalInterceptors(
    new TimeoutInterceptor(),
    new LoggingInterceptor(logger),
    new TransformInterceptor(),
  );
}

/** Swagger documentation (non-production only) */
function setupSwagger(app: ReturnType<typeof NestFactory.create> extends Promise<infer T> ? T : never, config: AppConfigService, logger: AppLogger): void {
  if (config.isProduction) return;

  try {
    const swaggerConfig = new DocumentBuilder()
      .setTitle(SWAGGER_TITLE)
      .setDescription(SWAGGER_DESCRIPTION)
      .setVersion(SWAGGER_VERSION)
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'jwt')
      .addApiKey({ type: 'apiKey', in: 'header', name: API_KEY_HEADER }, 'api-key')
      .addTag('Health', 'Health check endpoints')
      .addTag('Authentication', 'User authentication endpoints')
      .addTag('Users', 'User management endpoints')
      .addTag('Todo Lists', 'Todo list management endpoints')
      .addTag('Todo Items', 'Todo item management endpoints')
      .addTag('Tags', 'Tag management endpoints')
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
    // Swagger failure is non-fatal — app should still start
    logger.logError(
      'swagger.initialization.failed',
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

/** Start listening on configured port */
async function startServer(app: ReturnType<typeof NestFactory.create> extends Promise<infer T> ? T : never, config: AppConfigService, logger: AppLogger): Promise<void> {
  const { port, host, name } = config.app;

  await app.listen(port, host);

  logger.logEvent('server.started', {
    attributes: {
      name,
      port,
      host,
      environment: config.app.nodeEnv,
      'swagger.url': config.isProduction ? 'disabled' : `http://${host}:${port}/${SWAGGER_PATH}`,
    },
  });
}

bootstrap();
```

- [ ] **Step 3: Verify the app compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/app.module.ts src/main.ts
git commit -m "feat: add app module and bootstrap with SRP-split main.ts"
```

---

## Task 12: Docker Compose for Dev Environment

**Files:**
- Create: `docker/Dockerfile`
- Create: `docker-compose.yml`

- [ ] **Step 1: Write `docker/Dockerfile`**

```dockerfile
# ============================================
# Stage 1: Base — shared system dependencies
# ============================================
FROM node:22-alpine AS base
RUN apk add --no-cache openssl libc6-compat dumb-init
WORKDIR /app

# ============================================
# Stage 2: Dependencies — install production deps
# ============================================
FROM base AS dependencies
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm ci --only=production && npx prisma generate
RUN cp -R node_modules /tmp/prod_modules
RUN npm ci

# ============================================
# Stage 3: Development — hot reload
# ============================================
FROM base AS development
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
EXPOSE 3000
CMD ["npm", "run", "start:dev"]

# ============================================
# Stage 4: Builder — compile TypeScript
# ============================================
FROM base AS builder
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ============================================
# Stage 5: Production — minimal runtime image
# ============================================
FROM base AS production

# Non-root user for security
RUN addgroup -g 1001 -S nestjs && adduser -S nestjs -u 1001 -G nestjs

COPY --from=builder --chown=nestjs:nestjs /app/dist ./dist
COPY --from=dependencies --chown=nestjs:nestjs /tmp/prod_modules ./node_modules
COPY --from=builder --chown=nestjs:nestjs /app/prisma ./prisma
COPY --from=builder --chown=nestjs:nestjs /app/package.json ./

USER nestjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/v1/health/live || exit 1

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main"]
```

- [ ] **Step 2: Write `docker-compose.yml`**

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: docker/Dockerfile
      target: development
    ports:
      - '3000:3000'
    volumes:
      - .:/app
      - /app/node_modules
    env_file:
      - .env.development
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - app-network

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: todo_dev
    ports:
      - '5432:5432'
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - app-network

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    volumes:
      - redis-data:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - app-network

networks:
  app-network:
    driver: bridge

volumes:
  postgres-data:
  redis-data:
```

- [ ] **Step 3: Commit**

```bash
git add docker/ docker-compose.yml
git commit -m "feat: add multi-stage Dockerfile and docker-compose for dev environment"
```

---

## Task 13: Verify Full Foundation

- [ ] **Step 1: Start infrastructure**

```bash
docker compose up -d postgres redis
```

Expected: Both services healthy.

- [ ] **Step 2: Run Prisma migration**

```bash
npx prisma migrate dev --name init
```

Expected: Migration created and applied. All 7 tables created.

- [ ] **Step 3: Build the app**

```bash
npm run build
```

Expected: Build succeeds with SWC.

- [ ] **Step 4: Start the app**

```bash
npm run start:dev
```

Expected: App starts, logs show server.started event with port 3000.

- [ ] **Step 5: Test health endpoints**

```bash
curl http://localhost:3000/api/v1/health
curl http://localhost:3000/api/v1/health/live
curl http://localhost:3000/api/v1/health/ready
```

Expected: All return `{ "success": true, "data": { "status": "..." } }`

- [ ] **Step 6: Test Swagger**

Open `http://localhost:3000/docs` in browser.
Expected: Swagger UI loads with Health tag and 3 endpoints.

- [ ] **Step 7: Test error response format**

```bash
curl http://localhost:3000/api/v1/nonexistent
```

Expected: Returns `{ "success": false, "error": { "code": "DAT0001", ... } }`

- [ ] **Step 8: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve foundation integration issues"
```

(Only if fixes were needed.)

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Project init, deps, configs | package.json, tsconfig, eslint, prettier, husky, env files |
| 2 | Constants & interfaces | constants/, interfaces/ |
| 3 | Error handling | AppError, ErrorFactory, Prisma error handler |
| 4 | Config module | Zod schema, AppConfigService, AppConfigModule |
| 5 | Logger module | AppLogger, Pino config, redaction, sanitizer, trace context |
| 6 | Database module | Prisma schema, PrismaService, BaseRepository |
| 7 | Middleware & pipes | RequestId, SecurityHeaders, ZodValidation, ParseUuid, Public |
| 8 | Filters & interceptors | AllExceptions, PrismaException, Transform, Logging, Timeout |
| 9 | Bootstrap & process handlers | Process signals, graceful shutdown |
| 10 | Health module | Health controller, service, module |
| 11 | App module & main.ts | Root module, SRP bootstrap |
| 12 | Docker | Multi-stage Dockerfile, docker-compose.yml |
| 13 | Integration verification | Start app, test endpoints, verify responses |
