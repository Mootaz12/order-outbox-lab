import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ListStageEventsQueryDto } from '@modules/stage-events/dtos/list-stage-events-query.dto';
import { OrderStageEventEntity } from '@modules/stage-events/entities/order-stage-event.entity';

/** Reads the `order_stage_events` audit log; the live side of this feature is StageEventsService. */
@Injectable()
export class StageEventHistoryService {
  constructor(
    @InjectRepository(OrderStageEventEntity)
    private readonly events: Repository<OrderStageEventEntity>,
  ) {}

  /** Returns up to `query.limit` rows for one order, sorted by id (oldest first by default). */
  listForOrder(orderId: string, query: ListStageEventsQueryDto): Promise<OrderStageEventEntity[]> {
    return this.events.find({
      where: { orderId },
      order: { id: query.order },
      take: query.limit,
    });
  }
}
