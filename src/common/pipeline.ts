/**
 * The pipeline's shared vocabulary: every status, stage, event name and channel is
 * declared once here so no module can drift into a near-miss spelling.
 */

export enum StageName {
  Payment = 'payment',
  Inventory = 'inventory',
  Email = 'email',
}

export enum StageStatus {
  Started = 'started',
  Completed = 'completed',
  Failed = 'failed',
}

export enum OrderStatus {
  Pending = 'pending',
  Fulfilled = 'fulfilled',
  Failed = 'failed',
}

export enum StageRetryStatus {
  Pending = 'pending',
  DeadLettered = 'dead_lettered',
}

/** Emitted once per order, fanning it out to every stage. */
export enum OrderEvent {
  Created = 'order.created',
}

export enum RedisChannel {
  StageEvents = 'stage_events',
}

/**
 * `retry` is consumed by the stage that owns it; `completed` and `failed` are
 * published for a compensation layer that does not exist yet.
 */
export type StageAction = 'retry' | 'completed' | 'failed';

export function stageEvent(stage: StageName, action: StageAction): string {
  return `${stage}.${action}`;
}

/** Every stage, in the order the dashboard and the status watcher expect them. */
export const STAGES = [StageName.Payment, StageName.Inventory, StageName.Email] as const;

export const STAGE_COUNT = STAGES.length;
