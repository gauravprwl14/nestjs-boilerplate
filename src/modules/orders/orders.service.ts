import { Injectable } from '@nestjs/common';
import { OrdersRepository } from './orders.repository';
import { CreateOrderDto } from './dto/create-order.dto';
import { Order, PaginatedOrders } from './interfaces/order-response.interface';
import { OrderWithItems } from '@database/interfaces';
import { AppLogger } from '@logger/logger.service';
import { ErrorException } from '@errors/types/error-exception';
import { DAT } from '@errors/error-codes';

@Injectable()
export class OrdersService {
  constructor(
    private readonly repo: OrdersRepository,
    private readonly logger: AppLogger,
  ) {}

  async getUserOrders(userId: number, page: number, limit: number): Promise<PaginatedOrders> {
    const offset = (page - 1) * limit;
    const { entries, total } = await this.repo.findIndexByUser(userId, limit, offset);

    if (entries.length === 0) return { orders: [], total: 0, page, limit };

    const hotIds = entries.filter(e => e.tier === 2).map(e => e.orderId);
    const warmIds = entries.filter(e => e.tier === 3).map(e => e.orderId);
    const coldEntries = entries.filter(e => e.tier === 4);

    const [hot, warm, cold] = await Promise.all([
      this.repo.findHotOrders(hotIds),
      this.repo.findWarmOrders(warmIds),
      this.repo.findColdOrders(coldEntries),
    ]);

    this.logger.logEvent('orders.user.fetched', {
      attributes: { userId, hot: hot.length, warm: warm.length, cold: cold.length },
    });

    const allOrders = [...hot, ...warm, ...cold].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    return { orders: allOrders.map(o => this.toResponse(o)), total, page, limit };
  }

  async getOrderById(orderId: bigint): Promise<Order> {
    const order = await this.repo.findOrderById(orderId);
    if (!order) {
      throw new ErrorException(DAT.NOT_FOUND, { message: `Order ${orderId} not found` });
    }
    return this.toResponse(order);
  }

  async createOrder(userId: number, dto: CreateOrderDto): Promise<{ orderId: string }> {
    const { orderId } = await this.repo.createOrder(userId, dto);
    this.logger.logEvent('order.created', { attributes: { userId, orderId: orderId.toString() } });
    return { orderId: orderId.toString() };
  }

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
