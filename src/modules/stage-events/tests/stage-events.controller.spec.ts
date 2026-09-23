import { BadRequestException, MessageEvent, ParseUUIDPipe } from '@nestjs/common';
import { Subject, firstValueFrom } from 'rxjs';
import { Repository } from 'typeorm';
import { StageName, StageStatus } from '@shared/pipeline';
import { StageEventsController } from '@modules/stage-events/controllers/stage-events.controller';
import { OrderStageEventEntity } from '@modules/stage-events/entities/order-stage-event.entity';
import { StageEventsService } from '@modules/stage-events/services/stage-events.service';
import { StageEventFrame } from '@modules/stage-events/types/stage-events.types';

const ORDER_ID = '4f9c2a8e-1b3d-4c5e-8f70-123456789abc';

/** Repository stand-in that records find() options and returns canned rows. */
class FakeRepository {
  readonly calls: unknown[] = [];
  rows: OrderStageEventEntity[] = [];

  /** Records the options and returns the canned rows. */
  async find(options: unknown): Promise<OrderStageEventEntity[]> {
    this.calls.push(options);
    return this.rows;
  }
}

/** StageEventsService stand-in whose forOrder() stream is driven by the test. */
class FakeStageEvents {
  readonly frames = new Subject<StageEventFrame>();
  readonly requested: string[] = [];

  /** Records the order id and returns the test-driven stream. */
  forOrder(orderId: string): Subject<StageEventFrame> {
    this.requested.push(orderId);
    return this.frames;
  }
}

describe('StageEventsController', () => {
  let repo: FakeRepository;
  let stageEvents: FakeStageEvents;
  let controller: StageEventsController;

  beforeEach(() => {
    repo = new FakeRepository();
    stageEvents = new FakeStageEvents();
    controller = new StageEventsController(
      stageEvents as unknown as StageEventsService,
      repo as unknown as Repository<OrderStageEventEntity>,
    );
  });

  it('stages() queries rows for the order ordered by id ascending', async () => {
    const row = { id: '1', orderId: ORDER_ID } as OrderStageEventEntity;
    repo.rows = [row];
    await expect(controller.stages(ORDER_ID)).resolves.toEqual([row]);
    expect(repo.calls).toEqual([{ where: { orderId: ORDER_ID }, order: { id: 'ASC' } }]);
  });

  it('stream() wraps each frame of the order as an SSE `stage` event', async () => {
    const next = firstValueFrom(controller.stream(ORDER_ID));
    const event: StageEventFrame = {
      orderId: ORDER_ID,
      stage: StageName.Inventory,
      status: StageStatus.Failed,
      attempt: 2,
      detail: 'out of stock',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    stageEvents.frames.next(event);
    await expect(next).resolves.toEqual({ type: 'stage', data: event } as MessageEvent);
    expect(stageEvents.requested).toEqual([ORDER_ID]);
  });

  it('ParseUUIDPipe rejects a non-uuid id before it reaches the handlers', async () => {
    await expect(
      new ParseUUIDPipe().transform('not-a-uuid', { type: 'param', data: 'id' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
