import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OrderStatus } from '../../shared/pipeline';
import { Order } from './order.entity';
import { enqueueOutbox } from '../outbox/enqueue-outbox';
import { parseCreateOrder } from './create-order.input';
import { DEFAULT_LIST_LIMIT, FIRST_ATTEMPT, MAX_LIST_LIMIT } from './orders.constants';
import { CreatedOrder, CreateOrderBody } from './orders.types';

@Injectable()
export class OrdersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
  ) {}

  /**
   * Inserts the order and its outbox row in one transaction, then returns
   * immediately. Nothing downstream has happened yet at this point — that is the
   * request, not a shortcoming of it.
   */
  async create(body: CreateOrderBody): Promise<CreatedOrder> {
    const { customerName, amount } = parseCreateOrder(body);

    return this.dataSource.transaction(async (manager) => {
      const order = await manager.save(
        manager.create(Order, { customerName, amount, status: OrderStatus.Pending }),
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

  list(limit = DEFAULT_LIST_LIMIT) {
    return this.orders.find({
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(Number(limit) || 1, 1), MAX_LIST_LIMIT),
    });
  }
}
