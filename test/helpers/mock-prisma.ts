/**
 * Creates a mock implementation of PrismaService for use in unit tests.
 *
 * Exposes the delegate surface the repositories touch: user, company,
 * department, userDepartment, tweet, tweetDepartment. Plus `$queryRaw`,
 * `$transaction`, and lifecycle hooks. Override methods with `mockResolvedValueOnce`.
 */
const buildDelegate = () => ({
  create: jest.fn(),
  createMany: jest.fn(),
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  findMany: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(),
  upsert: jest.fn(),
  delete: jest.fn(),
  deleteMany: jest.fn(),
  count: jest.fn(),
  aggregate: jest.fn(),
});

export const createMockPrisma = () => {
  const mock: Record<string, unknown> = {
    user: buildDelegate(),
    company: buildDelegate(),
    department: buildDelegate(),
    userDepartment: buildDelegate(),
    tweet: buildDelegate(),
    tweetDepartment: buildDelegate(),
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([]),
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(0),
    isHealthy: jest.fn().mockResolvedValue(true),
  };
  mock.$transaction = jest.fn((fnOrOps: unknown) => {
    if (typeof fnOrOps === 'function') {
      return Promise.resolve((fnOrOps as (tx: unknown) => unknown)(mock));
    }
    return Promise.resolve(fnOrOps);
  });
  return mock;
};
