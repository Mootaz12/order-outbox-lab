import { EntityManager } from 'typeorm';
import { StageName } from '@shared/pipeline';
import { enqueueOutbox } from '@modules/outbox/helpers/enqueue-outbox.helper';
import { OutboxEntity } from '@modules/outbox/entities/outbox.entity';

/** A fake EntityManager that only records insert() calls. */
function insertRecorder() {
  const calls: Array<{ target: unknown; values: Record<string, unknown> }> = [];
  const manager = {
    insert: async (target: unknown, values: Record<string, unknown>) => {
      calls.push({ target, values });
    },
  };
  return { calls, manager: manager as unknown as EntityManager };
}

describe('enqueueOutbox', () => {
  it('writes an untagged row whose payload mirrors the columns and omits availableAt', async () => {
    const { calls, manager } = insertRecorder();

    await enqueueOutbox(manager, { orderId: 'o-1', stage: null, attempt: 1 });

    expect(calls).toHaveLength(1);
    expect(calls[0].target).toBe(OutboxEntity);
    expect(calls[0].values).toEqual({
      orderId: 'o-1',
      stage: null,
      payload: { orderId: 'o-1', stage: null, attempt: 1 },
    });
    expect('availableAt' in calls[0].values).toBe(false);
  });

  it('writes a stage-tagged row with availableAt when given', async () => {
    const { calls, manager } = insertRecorder();
    const availableAt = new Date('2026-01-01T00:00:02Z');

    await enqueueOutbox(manager, { orderId: 'o-2', stage: StageName.Payment, attempt: 3, availableAt });

    expect(calls[0].values).toEqual({
      orderId: 'o-2',
      stage: StageName.Payment,
      payload: { orderId: 'o-2', stage: StageName.Payment, attempt: 3 },
      availableAt,
    });
  });
});
