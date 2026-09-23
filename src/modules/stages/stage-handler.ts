import { Inject, Injectable, Type } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { appConfig, AppConfig } from '../../config';
import { OrderEvent, StageName, STAGES, stageEvent } from '../../shared/pipeline';
import { OutboxPayload } from '../outbox/outbox.types';
import { StageEventsService } from '../stage-events/stage-events.service';
import { StageRunner } from './stage-runner';
import { STAGE_CONFIGS } from './stages.constants';
import { StageConfig } from './stages.types';

/** `payment` → `PaymentService`: the logger context each stage has always logged under. */
export function stageHandlerName(stage: StageName): string {
  return `${stage.charAt(0).toUpperCase()}${stage.slice(1)}Service`;
}

/**
 * Builds one provider class per stage. It has to be a distinct class, not one class
 * instantiated three times: `@OnEvent` metadata lives on the prototype, and the retry
 * event differs per stage. Each stage subscribes to exactly the fan-out event and its
 * own retry event, and both handlers go straight into `run()`, which never rejects.
 */
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

    @OnEvent(OrderEvent.Created)
    async onOrderCreated(payload: OutboxPayload): Promise<void> {
      await this.run(payload.orderId, payload.attempt);
    }

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
