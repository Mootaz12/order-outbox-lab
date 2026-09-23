import { EntityManager } from 'typeorm';
import { OutboxEntity } from '@modules/outbox/entities/outbox.entity';
import { OutboxEntry } from '@modules/outbox/types/outbox.types';

/** The single write path into `outbox`: inserts one row on the caller's transaction manager.
 * Pass the manager of the transaction making the state change; never open a new one. */
export async function enqueueOutbox(
  manager: EntityManager,
  { orderId, stage, attempt, availableAt }: OutboxEntry,
): Promise<void> {
  await manager.insert(OutboxEntity, {
    orderId,
    stage,
    payload: { orderId, stage, attempt },
    ...(availableAt ? { availableAt } : {}),
  });
}
