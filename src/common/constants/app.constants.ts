/** Default API route prefix */
export const DEFAULT_API_PREFIX = 'api';

/**
 * Default API version number (no 'v' prefix — NestJS URI versioning adds that).
 * Routes are accessed as /api/v1/...
 */
export const DEFAULT_API_VERSION = '1';

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
