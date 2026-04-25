/**
 * Configuration for a raw pg.Pool connection.
 * Passed to MultiDbService.createPool() for each tier during module init.
 */
export interface PoolConfig {
  /** Hostname of the Postgres server */
  host: string;
  /** Port number (typically 5432) */
  port: number;
  /** Name of the Postgres database to connect to */
  database: string;
  /** Postgres username */
  user: string;
  /** Postgres password */
  password: string;
  /** Maximum number of clients in the pool (defaults to 10 if omitted) */
  max?: number;
}

/**
 * Row shape returned from the `archive_databases` table.
 * Each row describes a single physical database that holds archived orders
 * for a particular year and storage tier.
 */
export interface ArchiveDbConfig {
  /** Auto-incremented primary key from archive_databases */
  id: number;
  /** Calendar year that this database covers (e.g. 2023, 2024) */
  archiveYear: number;
  /** Postgres database name on the archive host */
  databaseName: string;
  /** Hostname of the archive Postgres server */
  host: string;
  /** Port number of the archive Postgres server */
  port: number;
  /**
   * Storage tier for this archive database.
   * 3 = warm (metadata summary only, hosted on the metadata server).
   * 4 = cold (full order + items, hosted on a dedicated archive server).
   */
  tier: 3 | 4;
  /** Whether this archive entry is active and should be included in routing */
  isActive: boolean;
}

/**
 * Storage tier discriminator used throughout the multi-tier routing layer.
 * 2 = hot (primary, orders_recent), 3 = warm (metadata archive), 4 = cold (year-sharded archive DB).
 */
export type DbTier = 2 | 3 | 4;

/**
 * A single row from the `user_order_index` table.
 * This lightweight index is the entry-point for any per-user order lookup —
 * it records which tier and (for cold orders) which archive location holds the
 * full order data, avoiding a full scan across all storage tiers.
 */
export interface UserOrderIndexEntry {
  /** ID of the user who placed the order (bigint from Postgres) */
  userId: bigint;
  /** ID of the order (bigint from Postgres) */
  orderId: bigint;
  /** When the order was created; used for ordering and archival eligibility */
  createdAt: Date;
  /** Which storage tier currently holds this order's full data */
  tier: DbTier;
  /**
   * For cold-tier orders (tier 4), identifies the archive location string
   * (e.g. "archive_2022") used to derive the year and resolve the correct pool.
   * Null for hot and warm orders.
   */
  archiveLocation: string | null;
}

/**
 * Raw column mapping for a single order returned from any of the three storage
 * tiers. Numeric fields (total_amount, unit_price, etc.) are returned as strings
 * by the pg driver and must be parsed before arithmetic.
 */
export interface OrderRow {
  /** Postgres bigint order PK, serialized as string by pg driver */
  order_id: string;
  /** Postgres bigint user FK, serialized as string */
  user_id: string;
  /** Human-readable order reference (e.g. "ORD-1714000000-42") */
  order_number: string;
  /** Decimal string — parse with parseFloat before use */
  total_amount: string;
  /** Order lifecycle state (e.g. "pending", "shipped", "delivered") */
  status: string;
  /** JSONB shipping address — not present in warm/cold metadata-only rows */
  shipping_address: Record<string, unknown>;
  /** Payment method identifier (e.g. "credit_card", "paypal") */
  payment_method: string;
  /** Last 4 digits of payment card; null for non-card methods or archived rows */
  payment_last4: string | null;
  /** Promotional coupon code applied at checkout; null if none */
  coupon_code: string | null;
  /** Order creation timestamp */
  created_at: Date;
  /** Last update timestamp; present on hot-tier rows, absent after archival */
  updated_at?: Date;
  /** Timestamp when the order was moved to an archive tier; undefined on hot rows */
  archived_at?: Date;
}

/**
 * Raw column mapping for a single line item within an order.
 * Returned together with its parent OrderRow and joined in-memory by the repository.
 */
export interface OrderItemRow {
  /** Postgres bigint item PK, serialized as string */
  item_id: string;
  /** FK back to the parent order */
  order_id: string;
  /** FK to the products table */
  product_id: string;
  /** Denormalized product name snapshot — present in cold-tier archives, may be absent in hot */
  product_name?: string;
  /** Number of units purchased */
  quantity: number;
  /** Per-unit price at time of purchase, decimal string */
  unit_price: string;
  /** Discount applied to this line item, decimal string */
  discount_amount: string;
  /** Tax amount applied to this line item, decimal string */
  tax_amount: string;
  /** When this line item was inserted */
  created_at: Date;
}

/**
 * Fully-hydrated order returned by the repository to feature services.
 * Extends OrderRow with line items, the resolved storage tier, and a
 * human-readable tier label so callers can surface where the data came from.
 */
export interface OrderWithItems extends OrderRow {
  /** Line items belonging to this order; empty array for warm-tier orders where items are not archived */
  items: OrderItemRow[];
  /** Numeric storage tier this order was fetched from */
  tier: DbTier;
  /** Human-readable tier label for API responses and diagnostics */
  tierName: 'hot' | 'warm' | 'cold';
  /** Archive location string (e.g. "archive_2022") for cold-tier orders; omitted otherwise */
  archive_location?: string;
}
