import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 10 },  // ramp up to 10 VUs
    { duration: '1m', target: 20 },  // ramp up to 20 VUs
    { duration: '0s', target: 0 },   // ramp down immediately
  ],
  thresholds: {
    http_req_duration: ['p(95)<300'],
    http_req_failed: ['rate<0.02'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const INDIAN_CITIES = [
  'Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai',
  'Kolkata', 'Pune', 'Ahmedabad', 'Jaipur', 'Surat',
];

const PAYMENT_METHODS = ['credit_card', 'debit_card', 'upi', 'net_banking', 'cod'];

const PRODUCTS = [
  { productId: 1, name: 'Wireless Headphones', unitPrice: 1499.00 },
  { productId: 2, name: 'USB-C Hub', unitPrice: 799.00 },
  { productId: 3, name: 'Mechanical Keyboard', unitPrice: 3299.00 },
  { productId: 4, name: 'Laptop Stand', unitPrice: 999.00 },
  { productId: 5, name: 'Webcam 1080p', unitPrice: 2199.00 },
  { productId: 6, name: 'Mouse Pad XL', unitPrice: 349.00 },
  { productId: 7, name: 'LED Desk Lamp', unitPrice: 599.00 },
  { productId: 8, name: 'Portable SSD 500GB', unitPrice: 4499.00 },
];

function randomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildPayload(userId) {
  const itemCount = Math.floor(Math.random() * 4) + 1;
  const items = [];
  let totalAmount = 0;

  for (let i = 0; i < itemCount; i++) {
    const product = randomElement(PRODUCTS);
    const quantity = Math.floor(Math.random() * 3) + 1;
    const discount = parseFloat((product.unitPrice * 0.05 * Math.random()).toFixed(2));
    const tax = parseFloat((product.unitPrice * 0.18).toFixed(2));
    items.push({
      productId: product.productId,
      productName: product.name,
      quantity,
      unitPrice: product.unitPrice,
      discountAmount: discount,
      taxAmount: tax,
    });
    totalAmount += product.unitPrice * quantity - discount + tax;
  }

  const city = randomElement(INDIAN_CITIES);
  const paymentMethod = randomElement(PAYMENT_METHODS);

  return JSON.stringify({
    userId,
    items,
    totalAmount: parseFloat(totalAmount.toFixed(2)),
    shippingAddress: {
      street: `${Math.floor(Math.random() * 500) + 1} MG Road`,
      city,
      state: 'Maharashtra',
      pincode: `4${Math.floor(Math.random() * 90000) + 10000}`,
      country: 'India',
    },
    paymentMethod,
    paymentLast4: paymentMethod === 'credit_card' || paymentMethod === 'debit_card'
      ? String(Math.floor(Math.random() * 9000) + 1000)
      : null,
    couponCode: Math.random() < 0.2 ? 'SAVE10' : null,
  });
}

export default function () {
  const userId = Math.floor(Math.random() * 10000) + 1;
  const payload = buildPayload(userId);

  const res = http.post(
    `${BASE_URL}/api/v1/orders?userId=${userId}`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': String(userId),
        Accept: 'application/json',
      },
    },
  );

  check(res, {
    'status is 201': r => r.status === 201,
    'response time < 300ms': r => r.timings.duration < 300,
  });

  sleep(1);
}
