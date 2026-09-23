import { STAGES, stageEvent } from '../../shared/pipeline';
import { backoffMs, nextActionAfterFailure } from './retry-policy';
import { MAX_RETRIES } from './stages.constants';
import { RetryDecision } from './stages.types';

describe('retry policy', () => {
  it('retries up to the limit, then dead-letters', () => {
    expect(nextActionAfterFailure(1)).toBe(RetryDecision.Retry);
    expect(nextActionAfterFailure(MAX_RETRIES - 1)).toBe(RetryDecision.Retry);
    expect(nextActionAfterFailure(MAX_RETRIES)).toBe(RetryDecision.DeadLetter);
    expect(nextActionAfterFailure(MAX_RETRIES + 5)).toBe(RetryDecision.DeadLetter);
  });

  it('gives a struggling dependency more room on each attempt', () => {
    expect(backoffMs(2)).toBeGreaterThan(backoffMs(1));
    expect(backoffMs(3)).toBeGreaterThan(backoffMs(2));
  });

  it('caps total attempts at MAX_RETRIES', () => {
    let attempts = 1;
    for (let failures = 1; nextActionAfterFailure(failures) === RetryDecision.Retry; failures++) {
      attempts++;
    }
    expect(attempts).toBe(MAX_RETRIES);
  });
});

describe('event vocabulary', () => {
  it('names every stage event after the stage that owns it', () => {
    expect(STAGES.map((stage) => stageEvent(stage, 'retry'))).toEqual([
      'payment.retry',
      'inventory.retry',
      'email.retry',
    ]);
  });
});
