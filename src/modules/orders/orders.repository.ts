import { Injectable } from '@nestjs/common';
import { MultiDbService } from '@database/multi-db.service';
import { ArchiveRegistryService } from '@database/archive-registry.service';
import { UserOrderIndexEntry, OrderRow, OrderItemRow, OrderWithItems } from '@database/interfaces';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersRepository {
  constructor(
    private readonly db: MultiDbService,
    private readonly registry: ArchiveRegistryService,
  ) {}

  /**
   * Queries the user_order_index for all orders belonging to a user,
   * with pagination.
   *
   * @param userId - The user whose orders to look up
   * @param limit - Max number of index entries to return
   * @param offset - Pagination offset
   * @returns Entries with tier/archiveLocation and the total count
   */
  async findIndexByUser(
    userId: number,
    limit: number,
    offset: number,
  ): Promise<{ entries: UserOrderIndexEntry[]; total: number }> {
    const pool = this.db.getReadPool();
    const [dataResult, countResult] = await Promise.all([
      pool.query<UserOrderIndexEntry>(
        `SELECT user_id AS "userId", order_id AS "orderId", created_at AS "createdAt",
                tier, archive_location AS "archiveLocation"
         FROM user_order_index
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset],
      ),
      pool.query<{ total: string }>(
        'SELECT COUNT(*) AS total FROM user_order_index WHERE user_id = $1',
        [userId],
      ),
    ]);
    return {
      entries: dataResult.rows,
      total: parseInt(countResult.rows[0].total, 10),
    };
  }

  /**
   * Fetches hot (recent) orders plus their items from the primary read replica.
   *
   * @param orderIds - List of order IDs to fetch (tier 2)
   * @returns Orders with items array populated
   */
  async findHotOrders(orderIds: bigint[]): Promise<OrderWithItems[]> {
    if (orderIds.length === 0) return [];
    const pool = this.db.getReadPool();
    const result = await pool.query<OrderRow>(
      `SELECT o.order_id, o.user_id, o.order_number, o.total_amount, o.status,
              o.shipping_address, o.payment_method, o.payment_last4, o.coupon_code,
              o.created_at, o.updated_at
       FROM orders_recent o
       WHERE o.order_id = ANY($1)`,
      [orderIds],
    );
    const itemsResult = await pool.query<OrderItemRow>(
      `SELECT item_id, order_id, product_id, quantity, unit_price,
              discount_amount, tax_amount, created_at
       FROM order_items_recent WHERE order_id = ANY($1)`,
      [orderIds],
    );
    const itemsByOrder = new Map<string, OrderItemRow[]>();
    for (const item of itemsResult.rows) {
      const key = item.order_id.toString();
      if (!itemsByOrder.has(key)) itemsByOrder.set(key, []);
      itemsByOrder.get(key)!.push(item);
    }
    return result.rows.map(o => ({
      ...o,
      items: itemsByOrder.get(o.order_id.toString()) ?? [],
      tier: 2 as const,
      tierName: 'hot' as const,
    }));
  }

  /**
   * Fetches warm (metadata archive) orders without full item details.
   *
   * @param orderIds - List of order IDs to fetch (tier 3)
   * @returns Orders with empty items arrays
   */
  async findWarmOrders(orderIds: bigint[]): Promise<OrderWithItems[]> {
    if (orderIds.length === 0) return [];
    const pool = this.db.getMetadataPool();
    const result = await pool.query<OrderRow>(
      `SELECT order_id, user_id, order_number, total_amount, status,
              '{}'::jsonb AS shipping_address, payment_method, NULL AS payment_last4,
              NULL AS coupon_code, created_at, archived_at AS updated_at
       FROM order_metadata_archive WHERE order_id = ANY($1)`,
      [orderIds],
    );
    return result.rows.map(o => ({
      ...o,
      items: [],
      tier: 3 as const,
      tierName: 'warm' as const,
      archive_location: 'metadata_archive_db',
    }));
  }

  /**
   * Fetches cold (archived) orders grouped by archive location, queried in parallel.
   *
   * @param entries - Index entries with archiveLocation (tier 4)
   * @returns Orders with items from each cold archive
   */
  async findColdOrders(entries: UserOrderIndexEntry[]): Promise<OrderWithItems[]> {
    if (entries.length === 0) return [];
    const byLocation = new Map<string, bigint[]>();
    for (const e of entries) {
      if (!e.archiveLocation) continue;
      if (!byLocation.has(e.archiveLocation)) byLocation.set(e.archiveLocation, []);
      byLocation.get(e.archiveLocation)!.push(e.orderId);
    }

    const promises = Array.from(byLocation.entries()).map(async ([location, ids]) => {
      const year = parseInt(location.replace('archive_', ''), 10);
      const pool = this.registry.getPoolForYear(year, 4);
      if (!pool) return [];
      const [ordersRes, itemsRes] = await Promise.all([
        pool.query<OrderRow>(
          `SELECT order_id, user_id, order_number, total_amount, status,
                  shipping_address, payment_method, coupon_code, created_at
           FROM archived_orders WHERE order_id = ANY($1)`,
          [ids],
        ),
        pool.query<OrderItemRow>(
          `SELECT item_id, order_id, product_id, product_name, quantity,
                  unit_price, discount_amount, tax_amount, created_at
           FROM archived_order_items WHERE order_id = ANY($1)`,
          [ids],
        ),
      ]);
      const itemsByOrder = new Map<string, OrderItemRow[]>();
      for (const item of itemsRes.rows) {
        const key = item.order_id.toString();
        if (!itemsByOrder.has(key)) itemsByOrder.set(key, []);
        itemsByOrder.get(key)!.push(item);
      }
      return ordersRes.rows.map(o => ({
        ...o,
        items: itemsByOrder.get(o.order_id.toString()) ?? [],
        tier: 4 as const,
        tierName: 'cold' as const,
        archive_location: location,
      }));
    });

    return (await Promise.all(promises)).flat();
  }

  /**
   * Looks up a single order by ID, routing to the correct storage tier.
   *
   * @param orderId - The order to retrieve
   * @returns The order with items, or null if not found in the index
   */
  async findOrderById(orderId: bigint): Promise<OrderWithItems | null> {
    const pool = this.db.getReadPool();
    const indexResult = await pool.query<UserOrderIndexEntry>(
      `SELECT user_id AS "userId", order_id AS "orderId", created_at AS "createdAt",
              tier, archive_location AS "archiveLocation"
       FROM user_order_index WHERE order_id = $1 LIMIT 1`,
      [orderId],
    );
    if (indexResult.rows.length === 0) return null;
    const entry = indexResult.rows[0];

    if (entry.tier === 2) {
      const results = await this.findHotOrders([orderId]);
      return results[0] ?? null;
    }
    if (entry.tier === 3) {
      const results = await this.findWarmOrders([orderId]);
      return results[0] ?? null;
    }
    const results = await this.findColdOrders([entry]);
    return results[0] ?? null;
  }

  /**
   * Creates a new order transactionally on the primary DB:
   * inserts into orders_recent, order_items_recent, and user_order_index.
   *
   * @param userId - The user placing the order
   * @param dto - Validated order payload
   * @returns The newly created order ID
   */
  async createOrder(userId: number, dto: CreateOrderDto): Promise<{ orderId: bigint }> {
    const pool = this.db.getPrimaryPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const productIds = dto.items.map(i => i.productId);
      const productsRes = await client.query<{ product_id: string; price: string; name: string }>(
        'SELECT product_id, price, name FROM products WHERE product_id = ANY($1)',
        [productIds],
      );
      const productMap = new Map(productsRes.rows.map(p => [parseInt(p.product_id, 10), p]));

      const totalAmount = dto.items.reduce((sum, item) => {
        const product = productMap.get(item.productId);
        return sum + (product ? parseFloat(product.price) * item.quantity : 0);
      }, 0);

      const orderNumber = `ORD-${Date.now()}-${userId}`;
      const orderRes = await client.query<{ order_id: bigint }>(
        `INSERT INTO orders_recent
           (user_id, order_number, total_amount, status, shipping_address,
            payment_method, payment_last4, coupon_code)
         VALUES ($1,$2,$3,'pending',$4,$5,$6,$7)
         RETURNING order_id`,
        [
          userId,
          orderNumber,
          totalAmount.toFixed(2),
          JSON.stringify(dto.shippingAddress),
          dto.paymentMethod,
          dto.paymentLast4 ?? null,
          dto.couponCode ?? null,
        ],
      );
      const orderId = orderRes.rows[0].order_id;

      for (const item of dto.items) {
        const product = productMap.get(item.productId)!;
        const unitPrice = parseFloat(product.price);
        const tax = parseFloat((unitPrice * 0.18).toFixed(2));
        await client.query(
          `INSERT INTO order_items_recent (order_id, product_id, quantity, unit_price, tax_amount)
           VALUES ($1,$2,$3,$4,$5)`,
          [orderId, item.productId, item.quantity, unitPrice, tax],
        );
      }

      await client.query(
        `INSERT INTO user_order_index (user_id, order_id, created_at, tier)
         VALUES ($1,$2,NOW(),2)`,
        [userId, orderId],
      );

      await client.query('COMMIT');
      return { orderId };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
