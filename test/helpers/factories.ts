import { faker } from '@faker-js/faker';

/** Creates a test Company row with realistic fake data. */
export const createTestCompany = (overrides: Record<string, unknown> = {}) => ({
  id: faker.string.uuid(),
  name: faker.company.name(),
  createdAt: new Date(),
  ...overrides,
});

/** Creates a test User row with realistic fake data. */
export const createTestUser = (overrides: Record<string, unknown> = {}) => ({
  id: faker.string.uuid(),
  companyId: faker.string.uuid(),
  email: faker.internet.email(),
  name: faker.person.fullName(),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

/** Creates a test Department row with realistic fake data. */
export const createTestDepartment = (overrides: Record<string, unknown> = {}) => ({
  id: faker.string.uuid(),
  companyId: faker.string.uuid(),
  parentId: null,
  name: faker.commerce.department(),
  createdAt: new Date(),
  ...overrides,
});

/** Creates a test UserDepartment pivot row. */
export const createTestUserDepartment = (overrides: Record<string, unknown> = {}) => ({
  userId: faker.string.uuid(),
  departmentId: faker.string.uuid(),
  companyId: faker.string.uuid(),
  assignedAt: new Date(),
  ...overrides,
});

/** Creates a test Tweet row. */
export const createTestTweet = (overrides: Record<string, unknown> = {}) => ({
  id: faker.string.uuid(),
  companyId: faker.string.uuid(),
  authorId: faker.string.uuid(),
  content: faker.lorem.sentence(),
  visibility: 'COMPANY',
  createdAt: new Date(),
  ...overrides,
});

/** Creates a test TweetDepartment pivot row. */
export const createTestTweetDepartment = (overrides: Record<string, unknown> = {}) => ({
  tweetId: faker.string.uuid(),
  departmentId: faker.string.uuid(),
  companyId: faker.string.uuid(),
  ...overrides,
});
