import { faker } from '@faker-js/faker';

/**
 * Creates a test user with realistic fake data.
 */
export const createTestUser = (overrides: Record<string, unknown> = {}) => ({
  id: faker.string.uuid(),
  email: faker.internet.email(),
  passwordHash: '$2b$10$abcdefghijklmnopqrstuvuXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  firstName: faker.person.firstName(),
  lastName: faker.person.lastName(),
  role: 'USER',
  status: 'ACTIVE',
  lockedUntil: null,
  failedLoginCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...overrides,
});

/**
 * Creates a test todo list with realistic fake data.
 */
export const createTestTodoList = (overrides: Record<string, unknown> = {}) => ({
  id: faker.string.uuid(),
  title: faker.lorem.words(3),
  description: faker.lorem.sentence(),
  userId: faker.string.uuid(),
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...overrides,
});

/**
 * Creates a test todo item with realistic fake data.
 */
export const createTestTodoItem = (overrides: Record<string, unknown> = {}) => ({
  id: faker.string.uuid(),
  title: faker.lorem.words(3),
  description: faker.lorem.sentence(),
  status: 'PENDING',
  priority: 'MEDIUM',
  dueDate: null,
  completedAt: null,
  todoListId: faker.string.uuid(),
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...overrides,
});

/**
 * Creates a test tag with realistic fake data.
 */
export const createTestTag = (overrides: Record<string, unknown> = {}) => ({
  id: faker.string.uuid(),
  name: faker.lorem.word(),
  color: faker.color.rgb(),
  createdAt: new Date(),
  ...overrides,
});
