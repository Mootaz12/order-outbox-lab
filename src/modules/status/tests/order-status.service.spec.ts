import { Logger } from '@nestjs/common';
import { Subject } from 'rxjs';
import { DataSource } from 'typeorm';
import {
  OrderStatus,
  STAGE_COUNT,
  StageName,
  StageRetryStatus,
  StageStatus,
} from '@shared/pipeline';
import { StageEventsService } from '@modules/stage-events/services/stage-events.service';
import { StageEventFrame } from '@modules/stage-events/types/stage-events.types';
import { OrderStatusService } from '@modules/status/services/order-status.service';

/** DataSource stand-in that records query(sql, params) and can be told to reject. */
class FakeDataSource {
  readonly queries: { sql: string; params: unknown[] }[] = [];
  failWith: Error | null = null;

  /** Records the call, then resolves or rejects per `failWith`. */
  async query(sql: string, params: unknown[]): Promise<unknown[]> {
    this.queries.push({ sql, params });
    if (this.failWith) throw this.failWith;
    return [];
  }
}

/** StageEventsService stand-in exposing settled() as a test-driven Subject. */
class FakeStageEvents {
  readonly settledFrames = new Subject<StageEventFrame>();

  /** Returns the test-driven settled stream. */
  settled(): Subject<StageEventFrame> {
    return this.settledFrames;
  }
}

const frame: StageEventFrame = {
  orderId: 'order-a',
  stage: StageName.Email,
  status: StageStatus.Completed,
  attempt: 1,
  detail: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

/** Lets the recompute promise chain (and its catch) run. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('OrderStatusService', () => {
  let db: FakeDataSource;
  let stageEvents: FakeStageEvents;

  beforeEach(async () => {
    db = new FakeDataSource();
    stageEvents = new FakeStageEvents();
    const service = new OrderStatusService(
      db as unknown as DataSource,
      stageEvents as unknown as StageEventsService,
    );
    await service.onModuleInit();
  });

  afterEach(() => jest.restoreAllMocks());

  it('issues the fulfilled then the failed UPDATE with enum params for one settled frame', async () => {
    stageEvents.settledFrames.next(frame);
    await flush();

    expect(db.queries.map((q) => q.params)).toEqual([
      ['order-a', OrderStatus.Fulfilled, OrderStatus.Pending, StageStatus.Completed, STAGE_COUNT],
      ['order-a', OrderStatus.Failed, OrderStatus.Pending, StageRetryStatus.DeadLettered],
    ]);
  });

  it('stamps updated_at and guards on status = $3 in both statements', async () => {
    stageEvents.settledFrames.next(frame);
    await flush();

    expect(db.queries).toHaveLength(2);
    for (const { sql } of db.queries) {
      expect(sql).toMatch(/updated_at\s*=\s*now\(\)/);
      expect(sql).toMatch(/status\s*=\s*\$3/);
    }
    expect(db.queries[0].sql).toContain('order_stage_events');
    expect(db.queries[1].sql).toContain('stage_retries');
  });

  it('logs a query rejection instead of throwing, and keeps handling later frames', async () => {
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    db.failWith = new Error('connection reset');

    stageEvents.settledFrames.next(frame);
    await flush();

    // The first UPDATE rejected, so the second is skipped for this frame.
    expect(db.queries).toHaveLength(1);
    expect(logged).toHaveBeenCalledWith(
      'status recompute failed for order-a: connection reset',
    );

    db.failWith = null;
    stageEvents.settledFrames.next({ ...frame, orderId: 'order-b' });
    await flush();
    expect(db.queries.slice(1).map((q) => q.params[0])).toEqual(['order-b', 'order-b']);
  });
});
