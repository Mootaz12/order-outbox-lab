import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Observable, Subject, filter } from 'rxjs';
import { RedisChannel, StageName, StageStatus } from '../common/pipeline';
import { RedisService } from '../redis/redis.service';

export interface StageEventMessage {
  orderId: string;
  stage: StageName;
  status: StageStatus;
  attempt: number;
  detail: string | null;
  /**
   * ISO timestamp matching the `created_at` the hydration endpoint returns, so the
   * dashboard renders both paths through the same field. Without it a live frame
   * falls back to the browser clock and the timeline column lies about ordering.
   */
  createdAt: string;
}

/**
 * Every stage-event row is published to Redis, and every instance feeds its local
 * SSE clients from the Redis subscription — including its own messages. One path,
 * so a browser attached to instance-1 sees orders claimed by instance-2.
 */
@Injectable()
export class StageEventsService implements OnModuleInit {
  private readonly logger = new Logger(StageEventsService.name);
  private readonly subject = new Subject<StageEventMessage>();

  constructor(private readonly redis: RedisService) {}

  async onModuleInit(): Promise<void> {
    await this.redis.subscribe(RedisChannel.StageEvents, (raw) => {
      let event: StageEventMessage;
      try {
        event = JSON.parse(raw);
      } catch {
        this.logger.warn(`ignoring malformed message on ${RedisChannel.StageEvents}`);
        return;
      }
      this.subject.next(event);
    });
  }

  publish(event: StageEventMessage): Promise<void> {
    return this.redis.publish(RedisChannel.StageEvents, event);
  }

  /** Raw stream for subscribers that want every event, e.g. the status watcher. */
  all(): Observable<StageEventMessage> {
    return this.subject.asObservable();
  }

  forOrder(orderId: string): Observable<StageEventMessage> {
    return this.subject.pipe(filter((event) => event.orderId === orderId));
  }

  /** Events that can settle an order — a `started` row decides nothing. */
  settled(): Observable<StageEventMessage> {
    return this.subject.pipe(
      filter((event) => event.status !== StageStatus.Started),
    );
  }
}
