import { BACKOFF_STEP_MS, MAX_RETRIES } from '@modules/stages/consts/stages.constants';
import { RetryDecision } from '@modules/stages/types/stages.types';

/** Grows with each attempt so a struggling dependency gets breathing room. */
export function backoffMs(attempt: number): number {
  return attempt * BACKOFF_STEP_MS;
}

/**
 * `retryCount` is the number of failures recorded for this (order, stage) *including*
 * the one just observed. At MAX_RETRIES we stop enqueueing and dead-letter instead,
 * so a stage makes at most MAX_RETRIES attempts in total.
 */
export function nextActionAfterFailure(retryCount: number): RetryDecision {
  return retryCount >= MAX_RETRIES ? RetryDecision.DeadLetter : RetryDecision.Retry;
}
