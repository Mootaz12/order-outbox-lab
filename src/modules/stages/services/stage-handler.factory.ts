import { Inject, Injectable, Type } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { appConfig, AppConfig } from '@config';
import { OrderEvent, StageName, STAGES, stageEvent } from '@shared/pipeline';
import { OutboxPayload } from '@modules/outbox/types/outbox.types';
import { StageEventsService } from '@modules/stage-events/services/stage-events.service';
import { StageRunner } from './stage-runner.service';
import { STAGE_CONFIGS } from '@modules/stages/consts/stages.constants';
import { StageConfig } from '@modules/stages/types/stages.types';

/** `payment` → `PaymentService`: the logger context each stage has always logged under. */
export function stageHandlerName(stage: StageName): string {
  return `${stage.charAt(0).toUpperCase()}${stage.slice(1)}Service`;
}

/** Builds a distinct provider class per stage, subscribed to `order.created` and its own `<stage>.retry`.
 *  One class per stage is required: `@OnEvent` metadata is per-prototype (see README). */
export function stageHandler(config: StageConfig): Type<StageRunner> {
  @Injectable()
  class StageHandler extends StageRunner {
    protected readonly config = config;

    // Declared here rather than inherited so `emitDecoratorMetadata` records the
    // parameter types Nest needs to inject them; the abstract base has no decorator.
    constructor(
      dataSource: DataSource,
      stageEvents: StageEventsService,
      @Inject(appConfig.KEY) app: AppConfig,
    ) {
      super(dataSource, stageEvents, app);
    }

    /** Fan-out entry point: every stage's first attempt. */
    @OnEvent(OrderEvent.Created)
    async onOrderCreated(payload: OutboxPayload): Promise<void> {
      await this.run(payload.orderId, payload.attempt);
    }

    /** Retry entry point: a stage-tagged outbox row queued by this stage's `fail()`. */
    @OnEvent(stageEvent(config.stage, 'retry'))
    async onRetry(payload: OutboxPayload): Promise<void> {
      await this.run(payload.orderId, payload.attempt);
    }
  }

  // The class name is the Logger context, so keep the names the logs have always shown.
  Object.defineProperty(StageHandler, 'name', { value: stageHandlerName(config.stage) });
  return StageHandler;
}

export const STAGE_HANDLERS = STAGES.map((stage) => stageHandler(STAGE_CONFIGS[stage]));
