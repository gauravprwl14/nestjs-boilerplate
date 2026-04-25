/**
 * A single line item returned with an order.
 *
 * Items are populated from the hot tier (primary DB + read replicas) and the
 * cold tier (year archive). The warm tier stores only order metadata — callers
 * should expect an empty or absent `items` array for warm-tier orders.
 */
export interface OrderItem {
  /** Surrogate key for the order item row (bigint serialised as string). */
  itemId: string;
  /** Foreign key referencing the product catalogue (bigint serialised as string). */
  productId: string;
  /** Human-readable product name; may be absent for cold-archived items. */
  productName?: string;
  /** Number of units ordered for this line item. */
  quantity: number;
  /** Per-unit price at the time of order, stored as a numeric string (e.g. "299.99"). */
  unitPrice: string;
  /** Discount applied to this line item, as a numeric string. */
  discountAmount: string;
  /** Tax amount applied to this line item, as a numeric string. */
  taxAmount: string;
}

/**
 * Unified order response shape returned by the API regardless of which storage
 * tier the order was fetched from.
 *
 * Tier semantics:
 * - **2 = hot** — live data; full items array available (primary DB + replicas)
 * - **3 = warm** — metadata-only archive (90 days+); items array is empty
 * - **4 = cold** — year-level archive; full items available via archive DB
 */
export interface Order {
  /** Order primary key (bigint serialised as string). */
  orderId: string;
  /** Owner user ID (bigint serialised as string). */
  userId: string;
  /** Human-readable order reference number. */
  orderNumber: string;
  /** Grand total amount as a numeric string (e.g. "1499.00"). */
  totalAmount: string;
  /** Current order status (e.g. "pending", "shipped", "delivered"). */
  status: string;
  /** Delivery address stored as a JSON object. */
  shippingAddress: Record<string, unknown>;
  /** Payment method used (credit_card | upi | cod | wallet). */
  paymentMethod: string;
  /** Last 4 digits of the payment card; absent for non-card methods. */
  paymentLast4?: string;
  /** Coupon code applied to the order; absent when none was used. */
  couponCode?: string;
  /** Timestamp when the order was originally placed. */
  createdAt: Date;
  /**
   * Storage tier the order was fetched from.
   * 2=hot (primary+replicas), 3=warm (metadata archive), 4=cold (year archive).
   */
  tier: 2 | 3 | 4;
  /** Human-readable tier label corresponding to the `tier` value. */
  tierName: 'hot' | 'warm' | 'cold';
  /** S3 / object-store path for cold-archived orders; absent for hot/warm. */
  archiveLocation?: string;
  /**
   * Line items for this order.
   * Empty for warm-tier orders (metadata archive stores no item detail).
   */
  items?: OrderItem[];
}

/**
 * Standard paginated wrapper for a list of orders.
 *
 * Returned by `GET /api/v1/orders/user/:userId`.
 */
export interface PaginatedOrders {
  /** Page of orders, sorted by `createdAt` DESC across all tiers. */
  orders: Order[];
  /** Total number of orders for the user across all tiers (from the index). */
  total: number;
  /** Current page number (1-indexed). */
  page: number;
  /** Number of items per page as requested. */
  limit: number;
}
