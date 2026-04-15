module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', {
      tsconfig: {
        types: ['jest', 'node'],
        paths: {
          '@/*': ['src/*'],
          '@config/*': ['src/config/*'],
          '@common/*': ['src/common/*'],
          '@modules/*': ['src/modules/*'],
          '@errors/*': ['src/errors/*'],
          '@database/*': ['src/database/*'],
          '@logger/*': ['src/logger/*'],
          '@telemetry/*': ['src/telemetry/*'],
        },
        baseUrl: '.',
      },
    }],
  },
  transformIgnorePatterns: ['node_modules/(?!(@faker-js/faker|uuid)/)'],
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
  coverageThreshold: {
    global: { lines: 70, statements: 70, branches: 35, functions: 60 },
  },
  coveragePathIgnorePatterns: [
    'node_modules', 'dist', '.module.ts', '.interface.ts', '.dto.ts', 'main.ts', 'index.ts',
  ],
};
