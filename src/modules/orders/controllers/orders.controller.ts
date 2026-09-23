import { Body, Controller, Get, Post, Query } from '@nestjs/common';
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

  /** GET /orders?limit=N: newest orders first; a non-numeric limit becomes NaN and is clamped to 1. */
  @Get()
  list(@Query('limit') limit?: string) {
    return this.orders.list(limit === undefined ? undefined : Number(limit));
  }
}
