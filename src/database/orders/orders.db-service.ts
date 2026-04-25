import { Injectable } from '@nestjs/common';
import { OrdersDbRepository } from './orders.db-repository';
import { UserOrderIndexEntry, OrderWithItems } from '@database/interfaces';
import { CreateOrderDto } from '@modules/orders/dto/create-order.dto';

/**
 * DB-layer façade over OrdersDbRepository.
 *
 * Feature services (e.g. OrdersService) inject this class rather than the
 * repository directly so that the raw-SQL implementation is an internal
 * detail.  This boundary also makes it straightforward to swap the
 * repository implementation (e.g. for testing) without touching feature code.
 */
@Injectable()
export class OrdersDbService {
  constructor(private readonly repo: OrdersDbRepository) {}

  /**
   * Returns a paginated page of user_order_index entries plus the total row count.
   *
   * @param userId - Numeric user ID to scope the query
   * @param limit - Page size (number of rows to return)
   * @param offset - Zero-based row offset for cursor-style pagination
   */
  findIndexByUser(userId: number, limit: number, offset: number) {
    return this.repo.findIndexByUser(userId, limit, offset);
  }

  /**
   * Fetches full order + item data from the hot tier (orders_recent) for the given IDs.
   *
   * @param orderIds - bigint order IDs whose tier=2 in the index
   */
  findHotOrders(orderIds: bigint[]): Promise<OrderWithItems[]> {
    return this.repo.findHotOrders(orderIds);
  }

  /**
   * Fetches summary-only order data from the warm tier (order_metadata_archive).
   * Line items are not available for warm orders.
   *
   * @param orderIds - bigint order IDs whose tier=3 in the index
   */
  findWarmOrders(orderIds: bigint[]): Promise<OrderWithItems[]> {
    return this.repo.findWarmOrders(orderIds);
  }

  /**
   * Fetches full order + item data from cold-tier year-sharded archive databases.
   *
   * @param entries - Index entries with tier=4 and non-null archiveLocation
   */
  findColdOrders(entries: UserOrderIndexEntry[]): Promise<OrderWithItems[]> {
    return this.repo.findColdOrders(entries);
  }

  /**
   * Resolves a single order across all tiers by consulting the index first.
   *
   * @param orderId - bigint order PK
   * @returns Hydrated order or null if not found in the index
   */
  findOrderById(orderId: bigint): Promise<OrderWithItems | null> {
    return this.repo.findOrderById(orderId);
  }

  /**
   * Creates a new order transactionally on the primary, inserting into
   * orders_recent, order_items_recent, and user_order_index.
   *
   * @param userId - ID of the authenticated user (sourced from CLS by the caller)
   * @param dto - Validated create-order payload
   * @returns The bigint orderId of the persisted order
   */
  createOrder(userId: number, dto: CreateOrderDto): Promise<{ orderId: bigint }> {
    return this.repo.createOrder(userId, dto);
  }
}
