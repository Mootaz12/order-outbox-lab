import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Interval } from '@nestjs/schedule';
import { DataSource, In } from 'typeorm';
import { env } from '../common/env';
import { OrderEvent, stageEvent } from '../common/pipeline';
import { Outbox } from '../entities/outbox.entity';

const BATCH_SIZE = 50;
const POLL_INTERVAL_MS = 2000;

/**
 * Competing consumers. Every instance runs this on its own interval; `FOR UPDATE
 * SKIP LOCKED` is what lets them all poll the same table without handing the same
 * row to two of them — a row one instance has locked is simply invisible to the
 * others for the duration of the transaction, rather than making them wait.
 *
 * Delivery is at-least-once: events are emitted before the commit that marks them
 * processed, so a failed commit replays them. Stage modules absorb the duplicates.
 */
@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);
  private readonly instanceId = env.instanceId;
  private running = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly events: EventEmitter2,
  ) {}

  @Interval(POLL_INTERVAL_MS)
  async poll(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const locked = await this.claimAndEmit();
      this.logger.log(`[${this.instanceId}] poller tick — locked ${locked} row(s)`);
    } catch (error) {
      this.logger.error(
        `[${this.instanceId}] poller tick failed: ${(error as Error).message}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async claimAndEmit(): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      const rows = await manager
        .createQueryBuilder(Outbox, 'outbox')
        .where('outbox.processed = false')
        .andWhere('outbox.available_at <= now()')
        .orderBy('outbox.created_at', 'ASC')
        .addOrderBy('outbox.id', 'ASC')
        .limit(BATCH_SIZE)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany();

      if (rows.length === 0) return 0;

      for (const row of rows) {
        // A tagged row retries one stage; an untagged one fans out to all three.
        // Deliberately not awaited: awaiting here would hold the row locks for the
        // whole simulated stage. Every handler must therefore swallow its own
        // failures — see StageRunner.run.
        this.events.emit(
          row.stage ? stageEvent(row.stage, 'retry') : OrderEvent.Created,
          row.payload,
        );
      }

      await manager.update(
        Outbox,
        { id: In(rows.map((row) => row.id)) },
        { processed: true, processedAt: new Date() },
      );

      return rows.length;
    });
  }
}
