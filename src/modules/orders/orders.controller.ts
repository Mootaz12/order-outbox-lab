import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderBody } from './create-order.input';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@Body() body: CreateOrderBody) {
    return this.orders.create(body ?? {});
  }

  @Get()
  list(@Query('limit') limit?: string) {
    return this.orders.list(limit === undefined ? undefined : Number(limit));
  }
}
