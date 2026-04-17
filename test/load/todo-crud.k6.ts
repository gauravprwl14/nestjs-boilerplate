import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = 'http://localhost:3000/api/v1';

export const options = {
  stages: [
    { duration: '10s', target: 5 },
    { duration: '30s', target: 20 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.05'],
  },
};

function getRandomEmail(): string {
  return `user-${Date.now()}-${Math.floor(Math.random() * 99999)}@test.example.com`;
}

export default function () {
  const email = getRandomEmail();
  const password = 'TestPassword123!';

  // ─── Register ────────────────────────────────────────────────────────────
  const registerRes = http.post(
    `${BASE_URL}/auth/register`,
    JSON.stringify({ email, password, firstName: 'Test', lastName: 'User' }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(registerRes, { 'register: status 201': r => r.status === 201 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const registerBody = registerRes.json() as any;
  const accessToken: string = registerBody?.data?.tokens?.accessToken;
  if (!accessToken) {
    return;
  }

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };

  // ─── Login ───────────────────────────────────────────────────────────────
  const loginRes = http.post(`${BASE_URL}/auth/login`, JSON.stringify({ email, password }), {
    headers: { 'Content-Type': 'application/json' },
  });
  check(loginRes, { 'login: status 200': r => r.status === 200 });

  // ─── Create Todo List ─────────────────────────────────────────────────────
  const createListRes = http.post(
    `${BASE_URL}/todo-lists`,
    JSON.stringify({ title: 'My k6 List', description: 'Created by load test' }),
    { headers: authHeaders },
  );
  check(createListRes, { 'create list: status 201': r => r.status === 201 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listBody = createListRes.json() as any;
  const listId: string = listBody?.data?.id;
  if (!listId) {
    return;
  }

  // ─── Create Todo Item ─────────────────────────────────────────────────────
  const createItemRes = http.post(
    `${BASE_URL}/todo-lists/${listId}/items`,
    JSON.stringify({ title: 'My k6 Task', description: 'A test task', priority: 'MEDIUM' }),
    { headers: authHeaders },
  );
  check(createItemRes, { 'create item: status 201': r => r.status === 201 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const itemBody = createItemRes.json() as any;
  const itemId: string = itemBody?.data?.id;
  if (!itemId) {
    return;
  }

  // ─── Update Item Status (PENDING → IN_PROGRESS) ───────────────────────────
  const updateRes = http.patch(
    `${BASE_URL}/todo-lists/${listId}/items/${itemId}`,
    JSON.stringify({ status: 'IN_PROGRESS' }),
    { headers: authHeaders },
  );
  check(updateRes, { 'update item: status 200': r => r.status === 200 });

  // ─── Delete Item ──────────────────────────────────────────────────────────
  const deleteItemRes = http.del(`${BASE_URL}/todo-lists/${listId}/items/${itemId}`, null, {
    headers: authHeaders,
  });
  check(deleteItemRes, { 'delete item: status 200': r => r.status === 200 });

  // ─── Delete List ──────────────────────────────────────────────────────────
  const deleteListRes = http.del(`${BASE_URL}/todo-lists/${listId}`, null, {
    headers: authHeaders,
  });
  check(deleteListRes, { 'delete list: status 200': r => r.status === 200 });

  sleep(0.5);
}
