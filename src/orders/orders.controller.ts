import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { OrdersService } from './orders.service';

@Controller()
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post('orders')
  create(@Body() body: { customerName?: unknown; amount?: unknown }) {
    return this.orders.create(body ?? {});
  }

  @Get('orders')
  list(@Query('limit') limit?: string) {
    return this.orders.list(limit === undefined ? undefined : Number(limit));
  }

  @Get('dead-letters')
  deadLetters() {
    return this.orders.deadLetters();
  }
}
