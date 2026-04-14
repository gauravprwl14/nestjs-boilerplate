module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
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
    global: { lines: 70, statements: 70, branches: 35, functions: 60 },
  },
  coveragePathIgnorePatterns: [
    'node_modules', 'dist', '.module.ts', '.interface.ts', '.dto.ts', 'main.ts', 'index.ts',
  ],
};
