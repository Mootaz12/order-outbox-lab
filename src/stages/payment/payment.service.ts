import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { OrderEvent, StageName, stageEvent } from '../../common/pipeline';
import { OutboxPayload } from '../../entities/outbox.entity';
import { StageEventsService } from '../../order-events/stage-events.service';
import { StageConfig, StageRunner } from '../stage-runner';

@Injectable()
export class PaymentService extends StageRunner {
  protected readonly config: StageConfig = {
    stage: StageName.Payment,
    minDelayMs: 700,
    maxDelayMs: 1500,
    failureRate: 0.1,
  };

  constructor(
    dataSource: DataSource,
    stageEvents: StageEventsService,
    events: EventEmitter2,
  ) {
    super(dataSource, stageEvents, events);
  }

  @OnEvent(OrderEvent.Created)
  async onOrderCreated(payload: OutboxPayload): Promise<void> {
    await this.run(payload.orderId, payload.attempt);
  }

  @OnEvent(stageEvent(StageName.Payment, 'retry'))
  async onRetry(payload: OutboxPayload): Promise<void> {
    await this.run(payload.orderId, payload.attempt);
  }
}
