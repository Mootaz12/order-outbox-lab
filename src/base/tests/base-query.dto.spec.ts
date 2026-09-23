import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { BaseQueryDto } from '@base/base-query.dto';
import { DEFAULT_QUERY_LIMIT, MAX_QUERY_LIMIT } from '@base/base.constants';
import { Order } from '@shared/order.enum';

/** A concrete subclass, since BaseQueryDto is abstract; it adds nothing. */
class PlainQueryDto extends BaseQueryDto {}

/** The same pipe main.ts installs globally, applied the way Nest applies it to `@Query()`. */
const pipe = new ValidationPipe({ transform: true, whitelist: true });
const parse = (query: Record<string, unknown>) =>
  pipe.transform(query, { type: 'query', metatype: PlainQueryDto }) as Promise<PlainQueryDto>;

describe('BaseQueryDto', () => {
  it('fills in the defaults when no params are given', async () => {
    const dto = await parse({});
    expect(dto).toBeInstanceOf(PlainQueryDto);
    expect(dto).toMatchObject({ limit: DEFAULT_QUERY_LIMIT, order: Order.Desc });
  });

  it('coerces the query-string limit to a number and accepts the order in any case', async () => {
    await expect(parse({ limit: '10', order: 'asc' })).resolves.toMatchObject({ limit: 10, order: Order.Asc });
    await expect(parse({ order: 'DeSc' })).resolves.toMatchObject({ order: Order.Desc });
  });

  it(`accepts the bounds 1 and ${MAX_QUERY_LIMIT}`, async () => {
    await expect(parse({ limit: '1' })).resolves.toMatchObject({ limit: 1 });
    await expect(parse({ limit: String(MAX_QUERY_LIMIT) })).resolves.toMatchObject({ limit: MAX_QUERY_LIMIT });
  });

  it.each(['0', '-5', String(MAX_QUERY_LIMIT + 1), '2.5', 'abc', ''])('rejects limit=%p with 400', async (limit) => {
    await expect(parse({ limit })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown sort direction with 400', async () => {
    await expect(parse({ order: 'sideways' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('drops params the DTO does not declare', async () => {
    const dto = await parse({ limit: '5', cacheBuster: '123' });
    expect(dto).not.toHaveProperty('cacheBuster');
  });
});
