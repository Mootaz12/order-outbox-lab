import { BadRequestException, MessageEvent, ParseUUIDPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { Subject, firstValueFrom } from 'rxjs';
import { StageName, StageStatus } from '@shared/pipeline';
import { StageEventsController } from '@modules/stage-events/controllers/stage-events.controller';
import { OrderStageEventEntity } from '@modules/stage-events/entities/order-stage-event.entity';
import { ListStageEventsQueryDto } from '@modules/stage-events/dtos/list-stage-events-query.dto';
import { StageEventHistoryService } from '@modules/stage-events/services/stage-event-history.service';
import { StageEventsService } from '@modules/stage-events/services/stage-events.service';
import { StageEventFrame } from '@modules/stage-events/types/stage-events.types';

const ORDER_ID = '4f9c2a8e-1b3d-4c5e-8f70-123456789abc';

/** StageEventHistoryService stand-in that records its arguments and returns canned rows. */
class FakeHistory {
  readonly calls: Array<[string, ListStageEventsQueryDto]> = [];
  rows: OrderStageEventEntity[] = [];

  /** Records the call and returns the canned rows. */
  async listForOrder(orderId: string, query: ListStageEventsQueryDto): Promise<OrderStageEventEntity[]> {
    this.calls.push([orderId, query]);
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
  let history: FakeHistory;
  let stageEvents: FakeStageEvents;
  let controller: StageEventsController;

  beforeEach(() => {
    history = new FakeHistory();
    stageEvents = new FakeStageEvents();
    controller = new StageEventsController(
      stageEvents as unknown as StageEventsService,
      history as unknown as StageEventHistoryService,
    );
  });

  it('stages() hands the order id and the validated query to the history service', async () => {
    const row = { id: '1', orderId: ORDER_ID } as OrderStageEventEntity;
    history.rows = [row];
    const query = plainToInstance(ListStageEventsQueryDto, {});
    await expect(controller.stages(ORDER_ID, query)).resolves.toEqual([row]);
    expect(history.calls).toEqual([[ORDER_ID, query]]);
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
