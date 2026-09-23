import { firstValueFrom, take, toArray } from 'rxjs';
import { EventBus } from '@infrastructure/event-bus/event-bus';
import { EventHandler } from '@infrastructure/event-bus/event-bus.types';
import { EventChannel, StageName, StageStatus } from '@shared/pipeline';
import { StageEventsService } from '@modules/stage-events/services/stage-events.service';
import { StageEventFrame } from '@modules/stage-events/types/stage-events.types';

/** In-memory bus: publish() records the call and delivers synchronously to subscribers. */
class FakeEventBus extends EventBus {
  readonly published: { channel: string; payload: unknown }[] = [];
  private readonly handlers = new Map<string, EventHandler<unknown>[]>();

  /** Records the publish and hands the payload to every handler on the channel. */
  async publish<T>(channel: string, payload: T): Promise<void> {
    this.published.push({ channel, payload });
    (this.handlers.get(channel) ?? []).forEach((handler) => handler(payload));
  }

  /** Registers a handler for the channel. */
  async subscribe<T>(channel: string, handler: EventHandler<T>): Promise<void> {
    const list = this.handlers.get(channel) ?? [];
    list.push(handler as EventHandler<unknown>);
    this.handlers.set(channel, list);
  }

  /** Always healthy. */
  async ping(): Promise<void> {}
}

/** Builds a frame with sensible defaults. */
function frame(overrides: Partial<StageEventFrame> = {}): StageEventFrame {
  return {
    orderId: 'order-a',
    stage: StageName.Payment,
    status: StageStatus.Completed,
    attempt: 1,
    detail: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('StageEventsService', () => {
  let bus: FakeEventBus;
  let service: StageEventsService;

  beforeEach(async () => {
    bus = new FakeEventBus();
    service = new StageEventsService(bus);
    await service.onModuleInit();
  });

  it('publishes frames to the stage_events channel', async () => {
    const event = frame();
    await service.publish(event);
    expect(bus.published).toEqual([{ channel: EventChannel.StageEvents, payload: event }]);
  });

  it('delivers nothing locally before onModuleInit subscribes', async () => {
    const fresh = new StageEventsService(new FakeEventBus());
    const seen: StageEventFrame[] = [];
    fresh.forOrder('order-a').subscribe((e) => seen.push(e));
    await fresh.publish(frame());
    expect(seen).toEqual([]);
  });

  it('forOrder() only emits frames for that order', async () => {
    const collected = firstValueFrom(service.forOrder('order-a').pipe(take(2), toArray()));
    const a1 = frame({ stage: StageName.Payment });
    const a2 = frame({ stage: StageName.Email });
    await service.publish(a1);
    await service.publish(frame({ orderId: 'order-b' }));
    await service.publish(a2);
    await expect(collected).resolves.toEqual([a1, a2]);
  });

  it('settled() skips started frames and keeps completed and failed ones', async () => {
    const seen: StageStatus[] = [];
    service.settled().subscribe((e) => seen.push(e.status));
    await service.publish(frame({ status: StageStatus.Started }));
    await service.publish(frame({ status: StageStatus.Completed }));
    await service.publish(frame({ status: StageStatus.Failed }));
    expect(seen).toEqual([StageStatus.Completed, StageStatus.Failed]);
  });

  it('fans one bus frame out to every local subscriber', async () => {
    const first: StageEventFrame[] = [];
    const second: StageEventFrame[] = [];
    service.forOrder('order-a').subscribe((e) => first.push(e));
    service.forOrder('order-a').subscribe((e) => second.push(e));
    await service.publish(frame());
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
  });
});
