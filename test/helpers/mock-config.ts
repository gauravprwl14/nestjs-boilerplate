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
  otel: {
    enabled: false,
    serviceName: 'test',
    exporterEndpoint: '',
    exporterProtocol: 'grpc',
  },
  cors: { origins: ['http://localhost:3001'] },
  shutdown: { timeoutMs: 5000 },
  isDevelopment: false,
  isProduction: false,
  isTest: true,
});
