export interface PoolConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  max?: number;
}

export interface ArchiveDbConfig {
  id: number;
  archiveYear: number;
  databaseName: string;
  host: string;
  port: number;
  tier: 3 | 4;
  isActive: boolean;
}

export type DbTier = 2 | 3 | 4;

export interface UserOrderIndexEntry {
  userId: bigint;
  orderId: bigint;
  createdAt: Date;
  tier: DbTier;
  archiveLocation: string | null;
}

export interface OrderRow {
  order_id: string;
  user_id: string;
  order_number: string;
  total_amount: string;
  status: string;
  shipping_address: Record<string, unknown>;
  payment_method: string;
  payment_last4: string | null;
  coupon_code: string | null;
  created_at: Date;
  updated_at?: Date;
  archived_at?: Date;
}

export interface OrderItemRow {
  item_id: string;
  order_id: string;
  product_id: string;
  product_name?: string;
  quantity: number;
  unit_price: string;
  discount_amount: string;
  tax_amount: string;
  created_at: Date;
}

export interface OrderWithItems extends OrderRow {
  items: OrderItemRow[];
  tier: DbTier;
  tierName: 'hot' | 'warm' | 'cold';
  archive_location?: string;
}
