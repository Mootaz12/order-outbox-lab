import 'reflect-metadata';
import { PARAMTYPES_METADATA, SELF_DECLARED_DEPS_METADATA } from '@nestjs/common/constants';
import { EVENT_LISTENER_METADATA } from '@nestjs/event-emitter/dist/constants';
import { DataSource } from 'typeorm';
import { appConfig } from '@config';
import { OrderEvent, STAGES, stageEvent } from '@shared/pipeline';
import { StageEventsService } from '@modules/stage-events/services/stage-events.service';
import { STAGE_HANDLERS, stageHandler } from '@modules/stages/services/stage-handler.factory';
import { StageRunner } from '@modules/stages/services/stage-runner.service';
import { STAGE_CONFIGS } from '@modules/stages/consts/stages.constants';

/** Every event name any method on the handler's prototype subscribes to. */
function subscribedEvents(handler: Function): string[] {
  const proto = handler.prototype;
  return Object.getOwnPropertyNames(proto)
    .filter((key) => key !== 'constructor' && typeof proto[key] === 'function')
    .flatMap((key) => Reflect.getMetadata(EVENT_LISTENER_METADATA, proto[key]) ?? [])
    .map(({ event }: { event: string }) => event);
}

describe('stage handler factory', () => {
  it('builds one handler per stage, named after the stage', () => {
    expect(STAGE_HANDLERS.map((handler) => handler.name)).toEqual([
      'PaymentService',
      'InventoryService',
      'EmailService',
    ]);
  });

  it('builds distinct classes that all extend StageRunner', () => {
    expect(new Set(STAGE_HANDLERS).size).toBe(STAGES.length);
    for (const handler of STAGE_HANDLERS) expect(handler.prototype).toBeInstanceOf(StageRunner);
  });

  it.each(STAGES.map((stage, i) => [stage, i] as const))(
    '%s subscribes to exactly order.created and its own retry event',
    (stage, i) => {
      expect(subscribedEvents(STAGE_HANDLERS[i]).sort()).toEqual(
        [OrderEvent.Created, stageEvent(stage, 'retry')].sort(),
      );
    },
  );

  it('keeps retry subscriptions per stage even for a freshly built class', () => {
    const payment = stageHandler(STAGE_CONFIGS[STAGES[0]]);
    const email = stageHandler(STAGE_CONFIGS[STAGES[2]]);
    expect(subscribedEvents(payment)).not.toContain(stageEvent(STAGES[2], 'retry'));
    expect(subscribedEvents(email)).not.toContain(stageEvent(STAGES[0], 'retry'));
  });

  it.each(STAGE_HANDLERS.map((handler) => [handler.name, handler] as const))(
    '%s exposes the constructor param types Nest injects',
    (_name, handler) => {
      const paramTypes = Reflect.getMetadata(PARAMTYPES_METADATA, handler);
      expect(paramTypes.slice(0, 2)).toEqual([DataSource, StageEventsService]);
      expect(paramTypes).toHaveLength(3);
      // The config is a type alias, so its reflected type is Object; @Inject supplies the token.
      const selfDeclared = Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, handler);
      expect(selfDeclared).toEqual([{ index: 2, param: appConfig.KEY }]);
    },
  );
});
