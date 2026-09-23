import { STAGES, StageName } from '../../shared/pipeline';
import {
  simulatedDelayMs,
  simulatedFailure,
  STAGE_CONFIGS,
  stageHandlerName,
} from './stage-config';

describe('stage config table', () => {
  it('keeps each stage under its own key', () => {
    for (const stage of STAGES) expect(STAGE_CONFIGS[stage].stage).toBe(stage);
  });

  it('keeps the simulated delays and failure rates the README documents', () => {
    expect(STAGES.map((stage) => STAGE_CONFIGS[stage])).toEqual([
      { stage: StageName.Payment, minDelayMs: 700, maxDelayMs: 1500, failureRate: 0.1 },
      { stage: StageName.Inventory, minDelayMs: 900, maxDelayMs: 2000, failureRate: 0.15 },
      { stage: StageName.Email, minDelayMs: 400, maxDelayMs: 1000, failureRate: 0.05 },
    ]);
  });

  it('logs each stage under the service name it has always used', () => {
    expect(STAGES.map(stageHandlerName)).toEqual([
      'PaymentService',
      'InventoryService',
      'EmailService',
    ]);
  });
});

describe('simulation', () => {
  const inventory = STAGE_CONFIGS[StageName.Inventory];

  it('maps the roll onto the configured delay range', () => {
    expect(simulatedDelayMs(inventory, 0)).toBe(900);
    expect(simulatedDelayMs(inventory, 0.5)).toBe(1450);
    expect(simulatedDelayMs(inventory, 0.9999)).toBeLessThanOrEqual(2000);
  });

  it('fails only when the roll lands under the failure rate', () => {
    expect(simulatedFailure(inventory, 0.14)).toBe('inventory dependency unavailable (simulated)');
    expect(simulatedFailure(inventory, 0.15)).toBeNull();
  });
});
