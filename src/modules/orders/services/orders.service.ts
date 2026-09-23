import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OrderStatus } from '@shared/pipeline';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { enqueueOutbox } from '@modules/outbox/helpers/enqueue-outbox.helper';
import { parseCreateOrder } from '@modules/orders/helpers/parse-create-order.helper';
import { FIRST_ATTEMPT } from '@modules/orders/consts/orders.constants';
import { ListOrdersQueryDto } from '@modules/orders/dtos/list-orders-query.dto';
import { CreatedOrder, CreateOrderBody } from '@modules/orders/types/orders.types';

@Injectable()
export class OrdersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(OrderEntity) private readonly orders: Repository<OrderEntity>,
  ) {}

  /** Saves the order and its untagged outbox row in one transaction; returns the pending order.
   * Throws BadRequestException (via parseCreateOrder) before touching the DB on a bad body. */
  async create(body: CreateOrderBody): Promise<CreatedOrder> {
    const { customerName, amount } = parseCreateOrder(body);

    return this.dataSource.transaction(async (manager) => {
      const order = await manager.save(
        manager.create(OrderEntity, { customerName, amount, status: OrderStatus.Pending }),
      );
      await enqueueOutbox(manager, { orderId: order.id, stage: null, attempt: FIRST_ATTEMPT });
      return {
        id: order.id,
        customerName: order.customerName,
        amount: order.amount,
        status: order.status,
      };
    });
  }

  /** Returns up to `query.limit` orders sorted by `created_at`, optionally filtered by status. */
  list(query: ListOrdersQueryDto): Promise<OrderEntity[]> {
    return this.orders.find({
      where: query.status ? { status: query.status } : {},
      order: { createdAt: query.order },
      take: query.limit,
    });
  }
}
