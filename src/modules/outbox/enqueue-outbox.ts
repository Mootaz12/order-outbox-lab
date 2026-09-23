import { EntityManager } from 'typeorm';
import { StageName } from '../../shared/pipeline';
import { Outbox } from './outbox.entity';

export interface OutboxEntry {
  orderId: string;
  /** `null` fans the order out to every stage; a stage name retries only that stage. */
  stage: StageName | null;
  attempt: number;
  /** Omitted means "deliverable now" (the column defaults to `now()`). */
  availableAt?: Date;
}

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
