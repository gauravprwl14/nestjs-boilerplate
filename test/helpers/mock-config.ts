/**
 * Creates a mock implementation of AppConfigService for use in unit tests.
 */
export const createMockConfig = () => ({
  app: {
    nodeEnv: 'test',
    name: 'test',
    port: 3001,
    host: '0.0.0.0',
    apiPrefix: 'api',
    apiVersion: 'v1',
    logLevel: 'warn',
  },
  database: { url: 'postgresql://test@localhost:5432/test' },
  redis: { host: 'localhost', port: 6379, password: '', db: 1 },
  auth: {
    jwtAccessSecret: 'test-secret-must-be-32-characters!!',
    jwtAccessExpiration: '15m',
    jwtRefreshSecret: 'test-refresh-secret-32-chars-long!!',
    jwtRefreshExpiration: '7d',
    apiKeyEncryptionSecret: 'test-api-key-secret-32-chars-lon!!',
    bcryptRounds: 4,
  },
  otel: {
    enabled: false,
    serviceName: 'test',
    exporterEndpoint: '',
    exporterProtocol: 'grpc',
  },
  throttle: { ttl: 60000, limit: 1000 },
  cors: { origins: ['http://localhost:3001'] },
  shutdown: { timeoutMs: 5000 },
  apiPath: 'api/v1',
  isDevelopment: false,
  isProduction: false,
  isTest: true,
});
