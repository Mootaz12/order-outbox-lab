import { StageName } from '../../shared/pipeline';

export interface StageConfig {
  stage: StageName;
  minDelayMs: number;
  maxDelayMs: number;
  /** Probability 0..1 that a given attempt fails. */
  failureRate: number;
}

/**
 * The only thing that differs between stages. Keyed by `StageName` so the compiler
 * refuses a stage without a config; adding a stage is a `pipeline.ts` enum entry plus
 * a row here — `STAGE_HANDLERS` builds its handler from this table.
 */
export const STAGE_CONFIGS: Readonly<Record<StageName, StageConfig>> = {
  [StageName.Payment]: {
    stage: StageName.Payment,
    minDelayMs: 700,
    maxDelayMs: 1500,
    failureRate: 0.1,
  },
  [StageName.Inventory]: {
    stage: StageName.Inventory,
    minDelayMs: 900,
    maxDelayMs: 2000,
    failureRate: 0.15,
  },
  [StageName.Email]: {
    stage: StageName.Email,
    minDelayMs: 400,
    maxDelayMs: 1000,
    failureRate: 0.05,
  },
};

/** `payment` → `PaymentService`: the logger context each stage has always logged under. */
export function stageHandlerName(stage: StageName): string {
  return `${stage.charAt(0).toUpperCase()}${stage.slice(1)}Service`;
}

/** `roll` is a uniform draw in [0, 1), passed in so the mapping stays deterministic. */
export function simulatedDelayMs({ minDelayMs, maxDelayMs }: StageConfig, roll: number): number {
  return Math.round(minDelayMs + roll * (maxDelayMs - minDelayMs));
}

/** The failure message for this attempt, or null when `roll` lands on success. */
export function simulatedFailure({ stage, failureRate }: StageConfig, roll: number): string | null {
  return roll < failureRate ? `${stage} dependency unavailable (simulated)` : null;
}
