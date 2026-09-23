import { BadRequestException, Controller, Get, MessageEvent, Param, Sse } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Observable, map } from 'rxjs';
import { Repository } from 'typeorm';
import { OrderStageEvent } from './order-stage-event.entity';
import { ORDER_ID_PATTERN } from './stage-events.constants';
import { StageEventsService } from './stage-events.service';

function assertOrderId(id: string): void {
  if (!ORDER_ID_PATTERN.test(id)) {
    throw new BadRequestException('order id must be a uuid');
  }
}

@Controller('orders')
export class StageEventsController {
  constructor(
    private readonly stageEvents: StageEventsService,
    @InjectRepository(OrderStageEvent)
    private readonly events: Repository<OrderStageEvent>,
  ) {}

  /** Hydration endpoint: the dashboard reads this before opening the stream. */
  @Get(':id/stages')
  async stages(@Param('id') id: string): Promise<OrderStageEvent[]> {
    assertOrderId(id);
    return this.events.find({ where: { orderId: id }, order: { id: 'ASC' } });
  }

  @Sse(':id/stream')
  stream(@Param('id') id: string): Observable<MessageEvent> {
    assertOrderId(id);
    return this.stageEvents.forOrder(id).pipe(
      map((event) => ({ type: 'stage', data: event }) as MessageEvent),
    );
  }
}
