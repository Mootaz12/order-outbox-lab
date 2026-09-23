import { StageConfig } from './stages.types';

/** `roll` is a uniform draw in [0, 1), passed in so the mapping stays deterministic. */
export function simulatedDelayMs({ minDelayMs, maxDelayMs }: StageConfig, roll: number): number {
  return Math.round(minDelayMs + roll * (maxDelayMs - minDelayMs));
}

/** The failure message for this attempt, or null when `roll` lands on success. */
export function simulatedFailure({ stage, failureRate }: StageConfig, roll: number): string | null {
  return roll < failureRate ? `${stage} dependency unavailable (simulated)` : null;
}
