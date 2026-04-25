import { Injectable } from '@nestjs/common';
import { OrdersDbService } from '@database/orders/orders.db-service';
import { CreateOrderDto } from './dto/create-order.dto';
import { Order, PaginatedOrders } from './interfaces/order-response.interface';
import { OrderWithItems } from '@database/interfaces';
import { AppLogger } from '@logger/logger.service';
import { ErrorException } from '@errors/types/error-exception';
import { DAT } from '@errors/error-codes';

/**
 * Feature service for order operations.
 *
 * Delegates all DB access to {@link OrdersDbService}. This class owns the
 * business logic layer: tier routing, parallel result merging, chronological
 * sort, response mapping, and structured logging.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly ordersDb: OrdersDbService,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Fetches a paginated list of orders for a user across all three storage tiers.
   *
   * Flow:
   * 1. Reads the lightweight `user_order_index` from the read replica to get
   *    order IDs and their tier assignments for the requested page window.
   * 2. Fans out to all three tiers in parallel (`Promise.all`).
   * 3. Merges results and sorts by `created_at` DESC before mapping to the
   *    response shape.
   *
   * @param userId - Internal numeric user ID (bigint-compatible integer).
   * @param page - 1-indexed page number.
   * @param limit - Number of orders per page; max 100.
   * @returns Paginated orders with the total count from the index.
   */
  async getUserOrders(userId: number, page: number, limit: number): Promise<PaginatedOrders> {
    const offset = (page - 1) * limit;
    const { entries, total } = await this.ordersDb.findIndexByUser(userId, limit, offset);

    // Early exit avoids unnecessary parallel DB calls when the page is empty
    if (entries.length === 0) return { orders: [], total: 0, page, limit };

    const hotIds = entries.filter(e => e.tier === 2).map(e => e.orderId);
    const warmIds = entries.filter(e => e.tier === 3).map(e => e.orderId);
    const coldEntries = entries.filter(e => e.tier === 4);

    // Fan out to all tiers simultaneously — independent queries, no ordering dependency
    const [hot, warm, cold] = await Promise.all([
      this.ordersDb.findHotOrders(hotIds),
      this.ordersDb.findWarmOrders(warmIds),
      this.ordersDb.findColdOrders(coldEntries),
    ]);

    this.logger.logEvent('orders.user.fetched', {
      attributes: { userId, hot: hot.length, warm: warm.length, cold: cold.length },
    });

    // Merge and re-sort by created_at DESC because each tier returns its own ordering
    const allOrders = [...hot, ...warm, ...cold].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    return { orders: allOrders.map(o => this.toResponse(o)), total, page, limit };
  }

  /**
   * Fetches a single order by its ID, routing to the correct storage tier via
   * `user_order_index`.
   *
   * @param orderId - The order's primary key as a bigint.
   * @returns The full order response including line items (where available).
   * @throws {ErrorException} `DAT.NOT_FOUND` when no order with the given ID exists.
   */
  async getOrderById(orderId: bigint): Promise<Order> {
    const order = await this.ordersDb.findOrderById(orderId);
    if (!order) throw new ErrorException(DAT.NOT_FOUND, { message: `Order ${orderId} not found` });
    return this.toResponse(order);
  }

  /**
   * Creates a new order for the given user inside a DB transaction.
   *
   * Product existence validation and total computation are performed inside the
   * transaction by `OrdersDbService.createOrder` — no pre-flight checks needed here.
   *
   * @param userId - Internal numeric user ID; sourced from the request context, never the client body.
   * @param dto - Validated order creation payload.
   * @returns Object containing the new order's ID serialised as a string.
   */
  async createOrder(userId: number, dto: CreateOrderDto): Promise<{ orderId: string }> {
    const { orderId } = await this.ordersDb.createOrder(userId, dto);
    this.logger.logEvent('order.created', { attributes: { userId, orderId: orderId.toString() } });
    return { orderId: orderId.toString() };
  }

  /**
   * Maps a raw DB row (possibly from any storage tier) to the public API response shape.
   *
   * Bigint IDs are serialised to strings to preserve precision in JSON.
   * Nullable DB fields are coerced to `undefined` so they are omitted from the response.
   *
   * @param o - Raw order row with optional joined items from the DB layer.
   * @returns The response-safe {@link Order} object.
   */
  private toResponse(o: OrderWithItems): Order {
    return {
      orderId: o.order_id.toString(),
      userId: o.user_id.toString(),
      orderNumber: o.order_number,
      totalAmount: o.total_amount,
      status: o.status,
      shippingAddress: o.shipping_address as Record<string, unknown>,
      paymentMethod: o.payment_method,
      paymentLast4: o.payment_last4 ?? undefined,
      couponCode: o.coupon_code ?? undefined,
      createdAt: o.created_at,
      tier: o.tier,
      tierName: o.tierName,
      archiveLocation: o.archive_location,
      items: o.items?.map(i => ({
        itemId: i.item_id.toString(),
        productId: i.product_id.toString(),
        productName: i.product_name,
        quantity: i.quantity,
        unitPrice: i.unit_price,
        discountAmount: i.discount_amount,
        taxAmount: i.tax_amount,
      })),
    };
  }
}
