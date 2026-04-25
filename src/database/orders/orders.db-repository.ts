import { Injectable } from '@nestjs/common';
import { MultiDbService } from '@database/multi-db.service';
import { ArchiveRegistryService } from '@database/archive-registry.service';
import { UserOrderIndexEntry, OrderRow, OrderItemRow, OrderWithItems } from '@database/interfaces';
import { CreateOrderDto } from '@modules/orders/dto/create-order.dto';

/**
 * Raw SQL repository for all order-related queries across the three storage tiers.
 *
 * Injected into OrdersDbService — feature services must never depend on this class
 * directly.  Each method is responsible for selecting the correct pg.Pool (primary
 * for writes, read replica for hot/warm lookups, archive pool for cold).
 *
 * Tier routing summary:
 * - hot (tier 2)  → `orders_recent` + `order_items_recent` on read replica
 * - warm (tier 3) → `order_metadata_archive` on metadata pool (items not stored)
 * - cold (tier 4) → `archived_orders` + `archived_order_items` on year-sharded archive pool
 */
@Injectable()
export class OrdersDbRepository {
  constructor(
    private readonly db: MultiDbService,
    private readonly registry: ArchiveRegistryService,
  ) {}

  /**
   * Fetches a paginated page of `user_order_index` rows for the given user,
   * along with the unpaginated total count (needed by callers to build
   * pagination metadata without a second request).
   *
   * Both queries run in parallel against the read replica to minimise latency.
   *
   * @param userId - Numeric user ID to filter by
   * @param limit - Maximum number of index entries to return (page size)
   * @param offset - Zero-based row offset for pagination
   * @returns Object containing the index entries (ordered newest-first) and total count
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
   * Fetches full order details (header + line items) from the hot tier for
   * all given order IDs in a single pair of parallel queries against the read replica.
   * Items are joined in-memory by order_id to avoid a SQL JOIN across potentially
   * large result sets.
   *
   * @param orderIds - Array of bigint order IDs to fetch; returns empty array immediately if empty
   * @returns OrderWithItems records with tier=2 and tierName='hot'
   */
  async findHotOrders(orderIds: bigint[]): Promise<OrderWithItems[]> {
    if (orderIds.length === 0) return [];
    const pool = this.db.getReadPool();
    const [ordersRes, itemsRes] = await Promise.all([
      pool.query<OrderRow>(
        `SELECT o.order_id, o.user_id, o.order_number, o.total_amount, o.status,
                o.shipping_address, o.payment_method, o.payment_last4, o.coupon_code,
                o.created_at, o.updated_at
         FROM orders_recent o WHERE o.order_id = ANY($1)`,
        [orderIds],
      ),
      pool.query<OrderItemRow>(
        `SELECT item_id, order_id, product_id, quantity, unit_price,
                discount_amount, tax_amount, created_at
         FROM order_items_recent WHERE order_id = ANY($1)`,
        [orderIds],
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
      tier: 2 as const,
      tierName: 'hot' as const,
    }));
  }

  /**
   * Fetches order summaries from the warm tier (metadata archive DB).
   * Only header-level fields are stored in the warm archive — line items are
   * intentionally omitted to keep metadata storage lean.  Callers receive an
   * empty `items` array and should surface this limitation in API responses.
   *
   * @param orderIds - Array of bigint order IDs; returns empty array immediately if empty
   * @returns OrderWithItems records with tier=3, tierName='warm', and items=[]
   */
  async findWarmOrders(orderIds: bigint[]): Promise<OrderWithItems[]> {
    if (orderIds.length === 0) return [];
    const pool = this.db.getMetadataPool();
    const result = await pool.query<OrderRow>(
      `SELECT order_id, user_id, order_number, total_amount, status,
              '{}'::jsonb AS shipping_address, payment_method,
              NULL AS payment_last4, NULL AS coupon_code, created_at
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
   * Fetches full order details from cold-tier (year-sharded) archive databases.
   *
   * Groups index entries by their `archiveLocation` string (e.g. "archive_2022"),
   * parses the year from that string, resolves the appropriate pg.Pool via the
   * ArchiveRegistryService, then fans out parallel queries — one pair (orders +
   * items) per distinct archive location.  Results are flattened into a single array.
   *
   * Entries with a null archiveLocation are silently skipped; this should not
   * occur if the index is consistent but avoids crashing on data anomalies.
   *
   * @param entries - UserOrderIndexEntry rows with tier=4; each must have a non-null archiveLocation
   * @returns OrderWithItems records with tier=4 and tierName='cold'; empty array if all pools are unresolved
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
                  shipping_address, payment_method, NULL AS payment_last4,
                  coupon_code, created_at
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
   * Looks up a single order across all storage tiers by its order ID.
   *
   * First consults `user_order_index` on the read replica (O(1) via PK) to
   * determine which tier holds the data, then delegates to the appropriate
   * tier-specific method.  Returns null if the order ID is not found in the index.
   *
   * @param orderId - bigint order PK to look up
   * @returns Fully hydrated OrderWithItems if found, or null
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

    if (entry.tier === 2) return (await this.findHotOrders([orderId]))[0] ?? null;
    if (entry.tier === 3) return (await this.findWarmOrders([orderId]))[0] ?? null;
    return (await this.findColdOrders([entry]))[0] ?? null;
  }

  /**
   * Persists a new order in a single primary-pool transaction spanning three tables:
   * 1. `orders_recent` — order header row (status defaults to "pending")
   * 2. `order_items_recent` — one row per DTO item; unit_price is read from the
   *    `products` table at insertion time so the stored price reflects the catalogue
   *    value at order creation, not the client-submitted value.
   * 3. `user_order_index` — index entry pointing to the hot tier (tier=2), enabling
   *    future lookups without scanning orders_recent.
   *
   * Tax is calculated as 18% of unit_price at insertion time.  If the transaction
   * fails for any reason (constraint violation, pool timeout, etc.) a ROLLBACK is
   * issued and the error is re-thrown to the caller.
   *
   * @param userId - ID of the authenticated user placing the order (read from CLS by the service layer)
   * @param dto - Validated create-order payload including items, shipping, and payment details
   * @returns The bigint orderId of the newly created order
   * @throws If any INSERT fails (e.g. unknown productId, constraint violation) after rolling back
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

      const orderRes = await client.query<{ order_id: bigint }>(
        `INSERT INTO orders_recent
           (user_id, order_number, total_amount, status, shipping_address,
            payment_method, payment_last4, coupon_code)
         VALUES ($1,$2,$3,'pending',$4,$5,$6,$7)
         RETURNING order_id`,
        [
          userId,
          `ORD-${Date.now()}-${userId}`,
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
        await client.query(
          `INSERT INTO order_items_recent (order_id, product_id, quantity, unit_price, tax_amount)
           VALUES ($1,$2,$3,$4,$5)`,
          [orderId, item.productId, item.quantity, unitPrice, +(unitPrice * 0.18).toFixed(2)],
        );
      }

      await client.query(
        `INSERT INTO user_order_index (user_id, order_id, created_at, tier) VALUES ($1,$2,NOW(),2)`,
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
