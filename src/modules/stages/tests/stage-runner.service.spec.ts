import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { StageName, StageRetryStatus, StageStatus } from '@shared/pipeline';
import { OutboxEntity } from '@modules/outbox/entities/outbox.entity';
import { StageEventsService } from '@modules/stage-events/services/stage-events.service';
import { STAGE_HANDLERS } from '@modules/stages/services/stage-handler.factory';
import { StageRunner } from '@modules/stages/services/stage-runner.service';
import { StageRetryEntity } from '@modules/stages/entities/stage-retry.entity';
import { MAX_RETRIES } from '@modules/stages/consts/stages.constants';
import { backoffMs } from '@modules/stages/helpers/retry-policy.helper';

const ORDER = '00000000-0000-0000-0000-000000000001';
const PaymentService = STAGE_HANDLERS[0];

/**
 * In-memory stand-ins for DataSource / StageEventsService. `log` records every
 * observable step in order so tests can assert sequencing (e.g. publish after commit).
 */
function buildFakes(opts: { claimed?: boolean; retryCount?: number; queryError?: Error } = {}) {
  const { claimed = true, retryCount = 1, queryError } = opts;
  const log: string[] = [];

  const query = jest.fn(async (sql: string, params: unknown[]) => {
    if (queryError) throw queryError;
    if (sql.includes('order_stage_events')) {
      log.push(`record:${params[2]}`);
      return params[2] === StageStatus.Started && !claimed ? [] : [{ id: '1' }];
    }
    if (sql.includes('stage_retries')) {
      log.push('upsert:stage_retries');
      return [{ retry_count: String(retryCount) }];
    }
    throw new Error(`unexpected query: ${sql}`);
  });

  const txManager = {
    query,
    update: jest.fn(async () => log.push('update:stage_retries')),
    insert: jest.fn(async () => log.push('insert:outbox')),
  };

  const dataSource = {
    manager: { query },
    transaction: jest.fn(async (cb: (manager: unknown) => Promise<unknown>) => {
      log.push('tx:begin');
      const result = await cb(txManager);
      log.push('tx:commit');
      return result;
    }),
  };

  const stageEvents = {
    publish: jest.fn(async (frame: { status: StageStatus }) => {
      log.push(`publish:${frame.status}`);
    }),
  };

  const runner: StageRunner = new PaymentService(
    dataSource as unknown as DataSource,
    stageEvents as unknown as StageEventsService,
    { instanceId: 'test-instance', port: 0 },
  );

  return { log, query, txManager, dataSource, stageEvents, runner };
}

describe('StageRunner (via PaymentService)', () => {
  let random: jest.SpyInstance;
  let errorLog: jest.SpyInstance;

  beforeEach(() => {
    random = jest.spyOn(Math, 'random');
    // Run the simulated delay immediately so tests stay fast and deterministic.
    jest.spyOn(global, 'setTimeout').mockImplementation(((cb: () => void) => {
      cb();
      return 0;
    }) as unknown as typeof setTimeout);
    for (const level of ['log', 'warn', 'debug'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
    }
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('success: records started then completed and publishes both', async () => {
    random.mockReturnValue(0.99); // above payment's 0.1 failure rate
    const { log, dataSource, stageEvents, runner } = buildFakes();

    await runner.run(ORDER, 1);

    expect(log).toEqual([
      'record:started',
      'publish:started',
      'record:completed',
      'publish:completed',
    ]);
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(stageEvents.publish).toHaveBeenLastCalledWith(
      expect.objectContaining({
        orderId: ORDER,
        stage: StageName.Payment,
        status: StageStatus.Completed,
        attempt: 1,
      }),
    );
  });

  it('duplicate delivery: nothing runs and nothing is published', async () => {
    random.mockReturnValue(0.99);
    const { log, query, dataSource, stageEvents, runner } = buildFakes({ claimed: false });

    await runner.run(ORDER, 1);

    expect(log).toEqual(['record:started']);
    expect(query).toHaveBeenCalledTimes(1);
    expect(stageEvents.publish).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(random).not.toHaveBeenCalled();
  });

  it('failure below the cap: records, upserts, enqueues attempt+1 with backoff, publishes after commit', async () => {
    random.mockReturnValue(0); // under the failure rate
    const { log, txManager, stageEvents, runner } = buildFakes({ retryCount: 1 });
    const attempt = 2;

    const before = Date.now();
    await runner.run(ORDER, attempt);
    const after = Date.now();

    expect(log).toEqual([
      'record:started',
      'publish:started',
      'tx:begin',
      'record:failed',
      'upsert:stage_retries',
      'insert:outbox',
      'tx:commit',
      'publish:failed',
    ]);
    expect(txManager.update).not.toHaveBeenCalled();
    expect(txManager.insert).toHaveBeenCalledWith(OutboxEntity, {
      orderId: ORDER,
      stage: StageName.Payment,
      payload: { orderId: ORDER, stage: StageName.Payment, attempt: attempt + 1 },
      availableAt: expect.any(Date),
    });
    const { availableAt } = (txManager.insert.mock.calls[0] as unknown[])[1] as { availableAt: Date };
    expect(availableAt.getTime()).toBeGreaterThanOrEqual(before + backoffMs(attempt));
    expect(availableAt.getTime()).toBeLessThanOrEqual(after + backoffMs(attempt));
    expect(stageEvents.publish).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: StageStatus.Failed, detail: expect.stringContaining('payment') }),
    );
  });

  it('failure at the cap: marks dead_lettered and enqueues nothing', async () => {
    random.mockReturnValue(0);
    const { log, txManager, runner } = buildFakes({ retryCount: MAX_RETRIES });

    await runner.run(ORDER, MAX_RETRIES);

    expect(txManager.insert).not.toHaveBeenCalled();
    expect(txManager.update).toHaveBeenCalledWith(
      StageRetryEntity,
      { orderId: ORDER, stage: StageName.Payment },
      { status: StageRetryStatus.DeadLettered },
    );
    expect(log.slice(-3)).toEqual(['update:stage_retries', 'tx:commit', 'publish:failed']);
  });

  it('never rejects when the manager throws', async () => {
    random.mockReturnValue(0);
    const { stageEvents, runner } = buildFakes({ queryError: new Error('connection reset') });

    await expect(runner.run(ORDER, 1)).resolves.toBeUndefined();
    expect(stageEvents.publish).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('connection reset'), expect.any(String));
  });

  it('never rejects when the transaction fails, and publishes no failed frame', async () => {
    random.mockReturnValue(0);
    const { log, txManager, runner } = buildFakes();
    txManager.insert.mockRejectedValueOnce(new Error('outbox insert failed'));

    await expect(runner.run(ORDER, 1)).resolves.toBeUndefined();
    expect(log).not.toContain('publish:failed');
    expect(errorLog).toHaveBeenCalled();
  });

  it('swallows a failed publish instead of aborting the attempt', async () => {
    random.mockReturnValue(0.99);
    const { log, stageEvents, runner } = buildFakes();
    stageEvents.publish.mockRejectedValue(new Error('redis down'));

    await expect(runner.run(ORDER, 1)).resolves.toBeUndefined();
    expect(log).toEqual(['record:started', 'record:completed']);
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('routes both @OnEvent entry points into run()', async () => {
    const { runner } = buildFakes();
    const run = jest.spyOn(runner, 'run').mockResolvedValue(undefined);
    const handler = runner as unknown as Record<'onOrderCreated' | 'onRetry', (p: unknown) => Promise<void>>;

    await handler.onOrderCreated({ orderId: ORDER, stage: null, attempt: 1 });
    await handler.onRetry({ orderId: ORDER, stage: StageName.Payment, attempt: 2 });

    expect(run.mock.calls).toEqual([
      [ORDER, 1],
      [ORDER, 2],
    ]);
  });
});
