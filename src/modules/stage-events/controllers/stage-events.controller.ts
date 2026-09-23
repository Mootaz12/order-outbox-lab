import { Controller, Get, MessageEvent, Param, ParseUUIDPipe, Query, Sse } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { ListStageEventsQueryDto } from '@modules/stage-events/dtos/list-stage-events-query.dto';
import { OrderStageEventEntity } from '@modules/stage-events/entities/order-stage-event.entity';
import { StageEventHistoryService } from '@modules/stage-events/services/stage-event-history.service';
import { StageEventsService } from '@modules/stage-events/services/stage-events.service';

@Controller('orders')
export class StageEventsController {
  constructor(
    private readonly stageEvents: StageEventsService,
    private readonly history: StageEventHistoryService,
  ) {}

  /** Hydration endpoint: the dashboard reads this before opening the stream. */
  @Get(':id/stages')
  stages(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListStageEventsQueryDto,
  ): Promise<OrderStageEventEntity[]> {
    return this.history.listForOrder(id, query);
  }

  /** Live SSE feed of this order's frames as `stage` events; no replay of past rows. */
  @Sse(':id/stream')
  stream(@Param('id', ParseUUIDPipe) id: string): Observable<MessageEvent> {
    return this.stageEvents.forOrder(id).pipe(
      map((event) => ({ type: 'stage', data: event }) as MessageEvent),
    );
  }
}
