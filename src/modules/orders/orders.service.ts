import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OrderStatus } from '../../shared/pipeline';
import { Order } from './order.entity';
import { enqueueOutbox } from '../outbox/enqueue-outbox';
import { CreateOrderBody, parseCreateOrder } from './create-order.input';

/** The first attempt of a stage is 1, not 0 — `attempt` is a human-facing column. */
const FIRST_ATTEMPT = 1;
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;

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
  async create(body: CreateOrderBody) {
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
