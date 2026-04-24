import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 20 },   // ramp up to 20 VUs
    { duration: '1m', target: 100 },  // ramp up to 100 VUs
    { duration: '1m', target: 0 },    // ramp down to 0 VUs
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const userId = Math.floor(Math.random() * 10000) + 1;
  const page = Math.floor(Math.random() * 5) + 1;

  const res = http.get(
    `${BASE_URL}/api/v1/orders/user/${userId}?page=${page}&limit=20`,
    {
      headers: {
        'x-user-id': String(userId),
        Accept: 'application/json',
      },
    },
  );

  check(res, {
    'status is 200': r => r.status === 200,
    'has orders array': r => {
      const body = JSON.parse(r.body);
      return Array.isArray(body.data?.orders ?? body.orders);
    },
    'response time < 200ms': r => r.timings.duration < 200,
  });

  sleep(0.5);
}
