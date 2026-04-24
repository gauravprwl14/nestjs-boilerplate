import { Controller, Get, Post, Param, Query, Body, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiSecurity } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { createOrderSchema, CreateOrderDto } from './dto/create-order.dto';
import { queryOrdersSchema, QueryOrdersDto } from './dto/query-orders.dto';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';
import { ApiEndpoint } from '@common/decorators/api-endpoint.decorator';

@ApiTags('orders')
@ApiSecurity('x-user-id')
@Controller({ path: 'orders', version: '1' })
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * Returns paginated orders for the given user across all storage tiers
   * (hot, warm, cold) merged and sorted by created_at DESC.
   */
  @Get('user/:userId')
  @ApiEndpoint({ summary: 'Get paginated orders for a user across all storage tiers' })
  async getUserOrders(
    @Param('userId', ParseIntPipe) userId: number,
    @Query(new ZodValidationPipe(queryOrdersSchema)) query: QueryOrdersDto,
  ) {
    return this.ordersService.getUserOrders(userId, query.page, query.limit);
  }

  /**
   * Returns a single order by ID, automatically routing to the correct
   * storage tier (hot / warm / cold) via the user_order_index.
   */
  @Get(':orderId')
  @ApiEndpoint({ summary: 'Get a single order by ID (routes to correct storage tier)' })
  async getOrder(@Param('orderId') orderId: string) {
    return this.ordersService.getOrderById(BigInt(orderId));
  }

  /**
   * Creates a new order. Writes transactionally to the primary DB only.
   * userId is provided as a query parameter and validated via ParseIntPipe.
   */
  @Post()
  @ApiEndpoint({ summary: 'Create a new order (writes to primary DB only)' })
  async createOrder(
    @Body(new ZodValidationPipe(createOrderSchema)) dto: CreateOrderDto,
    @Query('userId', ParseIntPipe) userId: number,
  ) {
    return this.ordersService.createOrder(userId, dto);
  }
}
