import { StageName } from '@shared/pipeline';
import { StageConfig } from '@modules/stages/types/stages.types';

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

/** Attempts per (order, stage) before it is dead-lettered. */
export const MAX_RETRIES = 3;

/** Backoff grows by this much per attempt: 1s, then 2s. */
export const BACKOFF_STEP_MS = 1000;
