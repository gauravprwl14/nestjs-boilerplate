import { Injectable } from '@nestjs/common';
import { OrdersDbRepository } from './orders.db-repository';
import { UserOrderIndexEntry, OrderWithItems } from '@database/interfaces';
import { CreateOrderDto } from '@modules/orders/dto/create-order.dto';

@Injectable()
export class OrdersDbService {
  constructor(private readonly repo: OrdersDbRepository) {}

  findIndexByUser(userId: number, limit: number, offset: number) {
    return this.repo.findIndexByUser(userId, limit, offset);
  }

  findHotOrders(orderIds: bigint[]): Promise<OrderWithItems[]> {
    return this.repo.findHotOrders(orderIds);
  }

  findWarmOrders(orderIds: bigint[]): Promise<OrderWithItems[]> {
    return this.repo.findWarmOrders(orderIds);
  }

  findColdOrders(entries: UserOrderIndexEntry[]): Promise<OrderWithItems[]> {
    return this.repo.findColdOrders(entries);
  }

  findOrderById(orderId: bigint): Promise<OrderWithItems | null> {
    return this.repo.findOrderById(orderId);
  }

  createOrder(userId: number, dto: CreateOrderDto): Promise<{ orderId: bigint }> {
    return this.repo.createOrder(userId, dto);
  }
}
