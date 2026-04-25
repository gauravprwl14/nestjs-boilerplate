import { Controller, Get, Post, Param, Query, Body, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiSecurity } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { createOrderSchema, CreateOrderDto } from './dto/create-order.dto';
import { queryOrdersSchema } from './dto/query-orders.dto';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';
import { ApiEndpoint } from '@common/decorators/api-endpoint.decorator';

/**
 * REST controller for order CRUD operations.
 *
 * Base path: `GET|POST /api/v1/orders`.
 * All routes require a valid `x-user-id` header (enforced by `AuthContextGuard`
 * via the global `APP_GUARD`; declared here as a Swagger hint only).
 */
@ApiTags('orders')
@ApiSecurity('x-user-id')
@Controller({ path: 'orders', version: '1' })
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * Returns a paginated list of orders for a specific user, merged across
   * all three storage tiers (hot, warm, cold) and sorted by `createdAt` DESC.
   *
   * @param userId - Numeric user ID from the URL path.
   * @param query - Validated page/limit query params (defaults: page=1, limit=20).
   * @returns {@link PaginatedOrders} containing orders and total count.
   */
  @Get('user/:userId')
  @ApiEndpoint({ summary: 'Get paginated orders for a user across all storage tiers' })
  async getUserOrders(
    @Param('userId', ParseIntPipe) userId: number,
    @Query(new ZodValidationPipe(queryOrdersSchema)) query: { page: number; limit: number },
  ) {
    return this.ordersService.getUserOrders(userId, query.page, query.limit);
  }

  /**
   * Returns a single order by its ID. The service consults `user_order_index`
   * to determine which storage tier holds the order, then fetches it from there.
   *
   * @param orderId - String-encoded bigint order ID from the URL path.
   * @returns The full {@link Order} response, including line items where available.
   */
  @Get(':orderId')
  @ApiEndpoint({ summary: 'Get a single order by ID (routes to correct storage tier)' })
  async getOrder(@Param('orderId') orderId: string) {
    return this.ordersService.getOrderById(BigInt(orderId));
  }

  /**
   * Creates a new order in the primary (hot) database.
   *
   * The `userId` is taken from the `?userId=` query param — in production this
   * would be read from the authenticated session; this approach matches the
   * mock-auth pattern used across the service.
   *
   * @param dto - Validated order payload (items, address, payment method).
   * @param userId - Numeric user ID from the query string.
   * @returns Object with the newly created `orderId` (string-encoded bigint).
   */
  @Post()
  @ApiEndpoint({ summary: 'Create a new order (writes to primary DB only)', successStatus: 201 })
  async createOrder(
    @Body(new ZodValidationPipe(createOrderSchema)) dto: CreateOrderDto,
    @Query('userId', ParseIntPipe) userId: number,
  ) {
    return this.ordersService.createOrder(userId, dto);
  }
}
