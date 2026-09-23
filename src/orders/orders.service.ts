import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OrderStatus, StageRetryStatus } from '../common/pipeline';
import { Order } from '../entities/order.entity';
import { Outbox } from '../entities/outbox.entity';
import { StageRetry } from '../entities/stage-retry.entity';

/** The first attempt of a stage is 1, not 0 — `attempt` is a human-facing column. */
const FIRST_ATTEMPT = 1;
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;

@Injectable()
export class OrdersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(StageRetry) private readonly retries: Repository<StageRetry>,
  ) {}

  /**
   * Inserts the order and its outbox row in one transaction, then returns
   * immediately. Nothing downstream has happened yet at this point — that is the
   * request, not a shortcoming of it.
   */
  async create(input: { customerName?: unknown; amount?: unknown }) {
    const customerName =
      typeof input?.customerName === 'string' ? input.customerName.trim() : '';
    if (!customerName) throw new BadRequestException('customerName is required');

    // `Number(null)`, `Number('')` and `Number('  ')` are all 0, so coercion alone would
    // happily accept an order with no amount at all. Check the text as well as the value.
    if (typeof input.amount !== 'number' && typeof input.amount !== 'string') {
      throw new BadRequestException('amount must be a number');
    }
    const text = String(input.amount).trim();
    const amount = Number(text);
    if (!text || !Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException('amount must be a non-negative number');
    }

    return this.dataSource.transaction(async (manager) => {
      const order = await manager.save(
        manager.create(Order, {
          customerName,
          amount: amount.toFixed(2),
          status: OrderStatus.Pending,
        }),
      );
      await manager.insert(Outbox, {
        orderId: order.id,
        stage: null,
        payload: { orderId: order.id, stage: null, attempt: FIRST_ATTEMPT },
      });
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

  deadLetters() {
    return this.retries.find({
      where: { status: StageRetryStatus.DeadLettered },
      order: { retryCount: 'DESC' },
    });
  }
}
