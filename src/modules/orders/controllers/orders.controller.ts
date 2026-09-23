import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ListOrdersQueryDto } from '@modules/orders/dtos/list-orders-query.dto';
import { OrdersService } from '@modules/orders/services/orders.service';
import { CreateOrderBody } from '@modules/orders/types/orders.types';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** POST /orders: validates the body and creates the order (201); nothing downstream has run yet. */
  @Post()
  create(@Body() body: CreateOrderBody) {
    return this.orders.create(body ?? {});
  }

  /** GET /orders?limit=&order=&status=: validated by ListOrdersQueryDto (400 on bad params). */
  @Get()
  list(@Query() query: ListOrdersQueryDto) {
    return this.orders.list(query);
  }
}
