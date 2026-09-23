import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ListDeadLettersQueryDto } from '@modules/orders/dtos/list-dead-letters-query.dto';
import { ListOrdersQueryDto } from '@modules/orders/dtos/list-orders-query.dto';
import { Order } from '@shared/order.enum';
import { OrderStatus, StageName } from '@shared/pipeline';

/** The same pipe main.ts installs globally, applied the way Nest applies it to `@Query()`. */
const pipe = new ValidationPipe({ transform: true, whitelist: true });
const parse = <T>(metatype: new () => T, query: Record<string, unknown>) =>
  pipe.transform(query, { type: 'query', metatype }) as Promise<T>;

describe('ListOrdersQueryDto', () => {
  it('defaults to the newest 50 with no status filter', async () => {
    const dto = await parse(ListOrdersQueryDto, {});
    expect(dto).toMatchObject({ limit: 50, order: Order.Desc });
    expect(dto.status).toBeUndefined();
  });

  it('accepts a known status and rejects anything else', async () => {
    await expect(parse(ListOrdersQueryDto, { status: 'fulfilled' })).resolves.toMatchObject({
      status: OrderStatus.Fulfilled,
    });
    await expect(parse(ListOrdersQueryDto, { status: 'shipped' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('still enforces the inherited limit rules', async () => {
    await expect(parse(ListOrdersQueryDto, { limit: '2.5' })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ListDeadLettersQueryDto', () => {
  it('accepts a known stage and rejects anything else', async () => {
    await expect(parse(ListDeadLettersQueryDto, { stage: 'inventory' })).resolves.toMatchObject({
      stage: StageName.Inventory,
    });
    await expect(parse(ListDeadLettersQueryDto, { stage: 'shipping' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
