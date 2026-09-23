import { Injectable, OnModuleInit } from '@nestjs/common';
import { Observable, Subject, filter } from 'rxjs';
import { EventBus } from '../../infrastructure/event-bus/event-bus';
import { EventChannel, StageStatus } from '../../shared/pipeline';
import { StageEventFrame } from './stage-event-frame';

export type { StageEventFrame } from './stage-event-frame';

/**
 * Every stage-event row is published to the event bus, and every instance feeds its
 * local SSE clients from the bus subscription — including its own messages. One path,
 * so a browser attached to instance-1 sees orders claimed by instance-2.
 */
@Injectable()
export class StageEventsService implements OnModuleInit {
  private readonly subject = new Subject<StageEventFrame>();

  constructor(private readonly bus: EventBus) {}

  async onModuleInit(): Promise<void> {
    await this.bus.subscribe<StageEventFrame>(EventChannel.StageEvents, (event) =>
      this.subject.next(event),
    );
  }

  publish(event: StageEventFrame): Promise<void> {
    return this.bus.publish(EventChannel.StageEvents, event);
  }

  /** Frames for one order, which is what a single SSE connection watches. */
  forOrder(orderId: string): Observable<StageEventFrame> {
    return this.subject.pipe(filter((event) => event.orderId === orderId));
  }

  /** Events that can settle an order — a `started` row decides nothing. */
  settled(): Observable<StageEventFrame> {
    return this.subject.pipe(
      filter((event) => event.status !== StageStatus.Started),
    );
  }
}
