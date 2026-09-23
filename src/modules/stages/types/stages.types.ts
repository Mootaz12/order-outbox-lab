import { StageName } from '@shared/pipeline';

export interface StageConfig {
  stage: StageName;
  minDelayMs: number;
  maxDelayMs: number;
  /** Probability 0..1 that a given attempt fails. */
  failureRate: number;
}

/** What to do once a failure has been recorded for this (order, stage). */
export enum RetryDecision {
  Retry = 'retry',
  DeadLetter = 'dead_letter',
}

/** `RETURNING retry_count` from the `stage_retries` upsert; pg returns integers as text. */
export interface RetryCounterRow {
  retry_count: string;
}

/** `RETURNING id` from an `order_stage_events` insert; empty when ON CONFLICT skipped it. */
export interface InsertedIdRow {
  id: string;
}
