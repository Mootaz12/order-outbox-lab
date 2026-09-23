import { EventBus } from '@infrastructure/event-bus/event-bus';
import { HEALTH_PING_TIMEOUT_MS, HealthKey } from '@modules/health/consts/health.constants';
import { EventBusHealthIndicator } from '@modules/health/services/event-bus-health.indicator';

/** Bus stand-in whose ping() records its deadline and resolves or rejects per `failWith`. */
class FakeEventBus extends EventBus {
  readonly deadlines: (number | undefined)[] = [];
  failWith: Error | null = null;

  /** Unused by the indicator. */
  async publish(): Promise<void> {}

  /** Unused by the indicator. */
  async subscribe(): Promise<void> {}

  /** Records the deadline, then resolves or rejects. */
  async ping(deadlineMs?: number): Promise<void> {
    this.deadlines.push(deadlineMs);
    if (this.failWith) throw this.failWith;
  }
}

describe('EventBusHealthIndicator', () => {
  let bus: FakeEventBus;
  let indicator: EventBusHealthIndicator;

  beforeEach(() => {
    bus = new FakeEventBus();
    indicator = new EventBusHealthIndicator(bus);
  });

  it('reports up when the ping resolves', async () => {
    await expect(indicator.isHealthy(HealthKey.EventBus)).resolves.toEqual({
      [HealthKey.EventBus]: { status: 'up' },
    });
  });

  it('reports down with the error message when the ping rejects', async () => {
    bus.failWith = new Error('ECONNREFUSED');
    await expect(indicator.isHealthy(HealthKey.EventBus)).resolves.toEqual({
      [HealthKey.EventBus]: { status: 'down', message: 'ECONNREFUSED' },
    });
  });

  it('passes HEALTH_PING_TIMEOUT_MS as the ping deadline', async () => {
    await indicator.isHealthy(HealthKey.EventBus);
    expect(bus.deadlines).toEqual([HEALTH_PING_TIMEOUT_MS]);
  });
});
