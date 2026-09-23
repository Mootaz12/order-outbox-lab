import { StageName } from '../../shared/pipeline';

/** The event body the relay emits in-process; stored as `outbox.payload`. */
export interface OutboxPayload {
  orderId: string;
  stage: StageName | null;
  attempt: number;
}

export interface OutboxEntry {
  orderId: string;
  /** `null` fans the order out to every stage; a stage name retries only that stage. */
  stage: StageName | null;
  attempt: number;
  /** Omitted means "deliverable now" (the column defaults to `now()`). */
  availableAt?: Date;
}
