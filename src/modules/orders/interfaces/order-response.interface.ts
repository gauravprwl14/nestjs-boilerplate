export interface OrderItem {
  itemId: string;
  productId: string;
  productName?: string;
  quantity: number;
  unitPrice: string;
  discountAmount: string;
  taxAmount: string;
}

export interface Order {
  orderId: string;
  userId: string;
  orderNumber: string;
  totalAmount: string;
  status: string;
  shippingAddress: Record<string, unknown>;
  paymentMethod: string;
  paymentLast4?: string;
  couponCode?: string;
  createdAt: Date;
  tier: 2 | 3 | 4;
  tierName: 'hot' | 'warm' | 'cold';
  archiveLocation?: string;
  items?: OrderItem[];
}

export interface PaginatedOrders {
  orders: Order[];
  total: number;
  page: number;
  limit: number;
}
