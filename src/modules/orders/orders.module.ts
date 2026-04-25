import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

/**
 * NestJS feature module for order CRUD operations.
 *
 * `OrdersDbService` (and the underlying repositories) are provided globally
 * by `DatabaseModule` — they do not need to be declared here.
 * `OrdersService` is exported so other modules (e.g. an admin module) can
 * inject it without re-providing it.
 */
@Module({
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
