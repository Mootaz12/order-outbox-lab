import { Global, Module } from '@nestjs/common';
import { EventBus } from './event-bus';
import { RedisEventBus } from './redis-event-bus';

/** The one line that picks the driver. Everything else injects `EventBus`. */
@Global()
@Module({
  providers: [{ provide: EventBus, useClass: RedisEventBus }],
  exports: [EventBus],
})
export class EventBusModule {}
