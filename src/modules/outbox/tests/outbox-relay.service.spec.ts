import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, FindOperator } from 'typeorm';
import { AppConfig } from '@config';
import { OrderEvent, StageName, stageEvent } from '@shared/pipeline';
import { OutboxRelayService } from '@modules/outbox/services/outbox-relay.service';
import { OutboxEntity } from '@modules/outbox/entities/outbox.entity';
import { OUTBOX_BATCH_SIZE } from '@modules/outbox/consts/outbox.constants';

type Row = Pick<OutboxEntity, 'id' | 'stage' | 'payload'>;

/** A chainable query builder that records calls and resolves getMany() with `rows`. */
function fakeQueryBuilder(rows: Row[]) {
  const calls: Array<[string, unknown[]]> = [];
  const qb: Record<string, unknown> = {};
  for (const name of ['where', 'andWhere', 'orderBy', 'addOrderBy', 'limit', 'setLock', 'setOnLocked']) {
    qb[name] = (...args: unknown[]) => {
      calls.push([name, args]);
      return qb;
    };
  }
  qb.getMany = async () => rows;
  return { qb, calls };
}

/** Fake manager (query builder + recorded update) and a DataSource running cb with it. */
function build(rows: Row[]) {
  const { qb, calls } = fakeQueryBuilder(rows);
  const updates: Array<{ target: unknown; criteria: { id: FindOperator<string[]> }; values: Record<string, unknown> }> = [];
  const manager = {
    createQueryBuilder: jest.fn(() => qb),
    update: jest.fn(async (target: unknown, criteria: { id: FindOperator<string[]> }, values: Record<string, unknown>) => {
      updates.push({ target, criteria, values });
    }),
  };
  const dataSource = { transaction: jest.fn((cb: (m: unknown) => unknown) => cb(manager)) };
  const emits: Array<[string, unknown]> = [];
  const events = { emit: (event: string, payload: unknown) => emits.push([event, payload]) };
  const relay = new OutboxRelayService(
    dataSource as unknown as DataSource,
    events as unknown as EventEmitter2,
    { instanceId: 'test' } as AppConfig,
  );
  return { relay, manager, dataSource, updates, emits, calls };
}

/** Runs the private claim step directly so its return value can be asserted. */
function claim(relay: OutboxRelayService): Promise<number> {
  return (relay as unknown as { claimAndEmit(): Promise<number> }).claimAndEmit();
}

const untagged: Row = { id: 'r1', stage: null, payload: { orderId: 'o1', stage: null, attempt: 1 } };
const tagged: Row = {
  id: 'r2',
  stage: StageName.Inventory,
  payload: { orderId: 'o2', stage: StageName.Inventory, attempt: 2 },
};

describe('OutboxRelayService', () => {
  beforeAll(() => Logger.overrideLogger(false));

  it('emits order.created for untagged rows and <stage>.retry for tagged rows, with the payload', async () => {
    const { relay, emits } = build([untagged, tagged]);

    await expect(claim(relay)).resolves.toBe(2);

    expect(emits).toEqual([
      [OrderEvent.Created, untagged.payload],
      [stageEvent(StageName.Inventory, 'retry'), tagged.payload],
    ]);
  });

  it('marks exactly the claimed ids processed inside the same transaction', async () => {
    const { relay, updates, dataSource } = build([untagged, tagged]);

    await claim(relay);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(updates).toHaveLength(1);
    expect(updates[0].target).toBe(OutboxEntity);
    expect(updates[0].criteria.id.value).toEqual(['r1', 'r2']);
    expect(updates[0].values.processed).toBe(true);
    expect(updates[0].values.processedAt).toBeInstanceOf(Date);
  });

  it('claims with SKIP LOCKED, oldest first, capped at the batch size', async () => {
    const { relay, calls } = build([]);

    await claim(relay);

    expect(calls).toEqual(
      expect.arrayContaining([
        ['limit', [OUTBOX_BATCH_SIZE]],
        ['setLock', ['pessimistic_write']],
        ['setOnLocked', ['skip_locked']],
        ['orderBy', ['outbox.created_at', 'ASC']],
      ]),
    );
  });

  it('returns 0, emits nothing and updates nothing on an empty batch', async () => {
    const { relay, emits, manager } = build([]);

    await expect(claim(relay)).resolves.toBe(0);

    expect(emits).toHaveLength(0);
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('skips a tick while the previous one is still running', async () => {
    const { relay, dataSource } = build([]);
    let release!: () => void;
    dataSource.transaction.mockImplementationOnce(
      () => new Promise<number>((resolve) => (release = () => resolve(0))),
    );

    const first = relay.poll();
    await relay.poll();
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);

    release();
    await first;
    await relay.poll();
    expect(dataSource.transaction).toHaveBeenCalledTimes(2);
  });

  it('poll swallows a failed transaction and frees the next tick', async () => {
    const { relay, dataSource } = build([]);
    dataSource.transaction.mockImplementationOnce(() => Promise.reject(new Error('db down')));

    await expect(relay.poll()).resolves.toBeUndefined();
    await relay.poll();
    expect(dataSource.transaction).toHaveBeenCalledTimes(2);
  });
});
