import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OrderStatus } from '@shared/pipeline';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { enqueueOutbox } from '@modules/outbox/helpers/enqueue-outbox.helper';
import { parseCreateOrder } from '@modules/orders/helpers/parse-create-order.helper';
import { DEFAULT_LIST_LIMIT, FIRST_ATTEMPT, MAX_LIST_LIMIT } from '@modules/orders/consts/orders.constants';
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

  /** Returns the newest orders; limit defaults to 50 and is clamped to 1..200 (garbage → 1). */
  list(limit = DEFAULT_LIST_LIMIT) {
    return this.orders.find({
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(Number(limit) || 1, 1), MAX_LIST_LIMIT),
    });
  }
}
