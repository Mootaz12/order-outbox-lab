import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { OrderEvent, StageName, stageEvent } from '../../common/pipeline';
import { OutboxPayload } from '../../entities/outbox.entity';
import { StageEventsService } from '../../order-events/stage-events.service';
import { StageConfig, StageRunner } from '../stage-runner';

@Injectable()
export class InventoryService extends StageRunner {
  protected readonly config: StageConfig = {
    stage: StageName.Inventory,
    minDelayMs: 900,
    maxDelayMs: 2000,
    failureRate: 0.15,
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

  @OnEvent(stageEvent(StageName.Inventory, 'retry'))
  async onRetry(payload: OutboxPayload): Promise<void> {
    await this.run(payload.orderId, payload.attempt);
  }
}
