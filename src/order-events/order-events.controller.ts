import { BadRequestException, Controller, Get, Param, Sse } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Observable, map } from 'rxjs';
import { Repository } from 'typeorm';
import { MessageEvent } from '@nestjs/common';
import { OrderStageEvent } from '../entities/order-stage-event.entity';
import { StageEventsService } from './stage-events.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('orders')
export class OrderEventsController {
  constructor(
    private readonly stageEvents: StageEventsService,
    @InjectRepository(OrderStageEvent)
    private readonly events: Repository<OrderStageEvent>,
  ) {}

  /** Hydration endpoint: the dashboard reads this before opening the stream. */
  @Get(':id/stages')
  async stages(@Param('id') id: string): Promise<OrderStageEvent[]> {
    if (!UUID.test(id)) {
      throw new BadRequestException('order id must be a uuid');
    }
    return this.events.find({ where: { orderId: id }, order: { id: 'ASC' } });
  }

  @Sse(':id/stream')
  stream(@Param('id') id: string): Observable<MessageEvent> {
    if (!UUID.test(id)) {
      throw new BadRequestException('order id must be a uuid');
    }
    return this.stageEvents.forOrder(id).pipe(
      map((event) => ({ type: 'stage', data: event }) as MessageEvent),
    );
  }
}
