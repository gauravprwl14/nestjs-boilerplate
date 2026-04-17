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

/** Mock-auth header carrying the authenticated user's UUID */
export const USER_ID_HEADER = 'x-user-id';

/** Swagger docs path */
export const SWAGGER_PATH = 'docs';

/** Swagger title */
export const SWAGGER_TITLE = 'Enterprise Twitter API';

/** Swagger description */
export const SWAGGER_DESCRIPTION =
  'Multi-tenant Twitter-style backend. Authenticate by passing x-user-id header (seed prints user ids).';

/** Swagger version */
export const SWAGGER_VERSION = '1.0';

/** Public route metadata key — routes marked @Public() skip AuthContextGuard */
export const IS_PUBLIC_KEY = 'isPublic';

/** Default maximum tweets returned by the timeline endpoint */
export const DEFAULT_TIMELINE_LIMIT = 100;

/** Maximum tweet content length (chars) */
export const MAX_TWEET_CONTENT_LENGTH = 280;
