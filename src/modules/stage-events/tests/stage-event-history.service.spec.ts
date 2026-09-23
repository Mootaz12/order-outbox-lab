import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { Repository } from 'typeorm';
import { Order } from '@shared/order.enum';
import { ListStageEventsQueryDto } from '@modules/stage-events/dtos/list-stage-events-query.dto';
import { OrderStageEventEntity } from '@modules/stage-events/entities/order-stage-event.entity';
import { StageEventHistoryService } from '@modules/stage-events/services/stage-event-history.service';

const ORDER_ID = '4f9c2a8e-1b3d-4c5e-8f70-123456789abc';

/** Builds the service over a repository whose find() records its options. */
function build() {
  const repo = { find: jest.fn(async () => []) };
  return { repo, service: new StageEventHistoryService(repo as unknown as Repository<OrderStageEventEntity>) };
}

describe('StageEventHistoryService.listForOrder', () => {
  it('reads one order oldest first by default, so the dashboard replays it as a timeline', async () => {
    const { repo, service } = build();

    await service.listForOrder(ORDER_ID, plainToInstance(ListStageEventsQueryDto, {}));

    expect(repo.find).toHaveBeenCalledWith({ where: { orderId: ORDER_ID }, order: { id: Order.Asc }, take: 50 });
  });

  it('honours a requested direction and limit', async () => {
    const { repo, service } = build();

    await service.listForOrder(ORDER_ID, plainToInstance(ListStageEventsQueryDto, { order: Order.Desc, limit: 3 }));

    expect(repo.find).toHaveBeenCalledWith({ where: { orderId: ORDER_ID }, order: { id: Order.Desc }, take: 3 });
  });
});

describe('ListStageEventsQueryDto', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });
  const parse = (query: Record<string, unknown>) =>
    pipe.transform(query, { type: 'query', metatype: ListStageEventsQueryDto }) as Promise<ListStageEventsQueryDto>;

  it('overrides only the default direction; an explicit order still wins', async () => {
    await expect(parse({})).resolves.toMatchObject({ order: Order.Asc, limit: 50 });
    await expect(parse({ order: 'desc' })).resolves.toMatchObject({ order: Order.Desc });
  });

  it('keeps the inherited validation on the redeclared field', async () => {
    await expect(parse({ order: 'sideways' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
