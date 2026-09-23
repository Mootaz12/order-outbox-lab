import { Controller, Get, MessageEvent, Param, ParseUUIDPipe, Sse } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Observable, map } from 'rxjs';
import { Repository } from 'typeorm';
import { OrderStageEventEntity } from '@modules/stage-events/entities/order-stage-event.entity';
import { StageEventsService } from '@modules/stage-events/services/stage-events.service';

@Controller('orders')
export class StageEventsController {
  constructor(
    private readonly stageEvents: StageEventsService,
    @InjectRepository(OrderStageEventEntity)
    private readonly events: Repository<OrderStageEventEntity>,
  ) {}

  /** Hydration endpoint: the dashboard reads this before opening the stream. */
  @Get(':id/stages')
  async stages(@Param('id', ParseUUIDPipe) id: string): Promise<OrderStageEventEntity[]> {
    return this.events.find({ where: { orderId: id }, order: { id: 'ASC' } });
  }

  @Sse(':id/stream')
  stream(@Param('id', ParseUUIDPipe) id: string): Observable<MessageEvent> {
    return this.stageEvents.forOrder(id).pipe(
      map((event) => ({ type: 'stage', data: event }) as MessageEvent),
    );
  }
}
