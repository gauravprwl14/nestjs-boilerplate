import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 5,
  duration: '1m30s',
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const ENDPOINTS = [
  { method: 'GET', path: '/admin/archival/stats' },
  { method: 'GET', path: '/admin/archival/database-sizes' },
  { method: 'GET', path: '/admin/archival/archive-for-year/2023' },
  { method: 'GET', path: '/mock-data/status' },
];

export default function () {
  const endpoint = ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)];
  const url = `${BASE_URL}${endpoint.path}`;

  const res = http.get(url, {
    headers: { Accept: 'application/json' },
  });

  check(res, {
    'status is 200': r => r.status === 200,
    'response time < 1000ms': r => r.timings.duration < 1000,
    'has JSON body': r => {
      try {
        JSON.parse(r.body);
        return true;
      } catch (_) {
        return false;
      }
    },
  });

  sleep(0.5);
}
