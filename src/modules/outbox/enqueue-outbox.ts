import { EntityManager } from 'typeorm';
import { Outbox } from './outbox.entity';
import { OutboxEntry } from './outbox.types';

/**
 * The single write path into `outbox`. It takes the caller's EntityManager rather
 * than opening its own transaction, because the whole point of an outbox row is to
 * commit atomically with the state change that caused it. It also keeps the `stage`
 * column and `payload.stage` from ever disagreeing.
 */
export async function enqueueOutbox(
  manager: EntityManager,
  { orderId, stage, attempt, availableAt }: OutboxEntry,
): Promise<void> {
  await manager.insert(Outbox, {
    orderId,
    stage,
    payload: { orderId, stage, attempt },
    ...(availableAt ? { availableAt } : {}),
  });
}
