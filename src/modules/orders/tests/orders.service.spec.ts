import { DataSource, Repository } from 'typeorm';
import { OrderStatus } from '@shared/pipeline';
import { OrdersService } from '@modules/orders/services/orders.service';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OutboxEntity } from '@modules/outbox/entities/outbox.entity';
import { FIRST_ATTEMPT } from '@modules/orders/consts/orders.constants';

/** A fake EntityManager: create() echoes, save() assigns an id, insert() is recorded. */
function fakeManager() {
  const inserts: Array<{ target: unknown; values: unknown }> = [];
  const saves: unknown[] = [];
  const manager = {
    inserts,
    saves,
    create: (_target: unknown, values: object) => ({ ...values }),
    save: async (entity: object) => {
      saves.push(entity);
      return { ...entity, id: 'order-1' };
    },
    insert: async (target: unknown, values: unknown) => {
      inserts.push({ target, values });
    },
  };
  return manager;
}

/** A fake DataSource whose transaction(cb) runs cb with one fake manager. */
function fakeDataSource(manager: ReturnType<typeof fakeManager>) {
  return { transaction: jest.fn((cb: (m: unknown) => unknown) => cb(manager)) };
}

function fakeOrdersRepo() {
  return { find: jest.fn(async () => []) };
}

function build() {
  const manager = fakeManager();
  const dataSource = fakeDataSource(manager);
  const repo = fakeOrdersRepo();
  const service = new OrdersService(
    dataSource as unknown as DataSource,
    repo as unknown as Repository<OrderEntity>,
  );
  return { service, manager, dataSource, repo };
}

describe('OrdersService.create', () => {
  it('saves a pending order and enqueues one untagged outbox row in the same transaction', async () => {
    const { service, manager, dataSource } = build();

    const created = await service.create({ customerName: ' Ada ', amount: '10' });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.saves).toEqual([
      { customerName: 'Ada', amount: '10.00', status: OrderStatus.Pending },
    ]);
    expect(manager.inserts).toHaveLength(1);
    expect(manager.inserts[0].target).toBe(OutboxEntity);
    expect(manager.inserts[0].values).toEqual({
      orderId: 'order-1',
      stage: null,
      payload: { orderId: 'order-1', stage: null, attempt: FIRST_ATTEMPT },
    });
    expect(created).toEqual({
      id: 'order-1',
      customerName: 'Ada',
      amount: '10.00',
      status: OrderStatus.Pending,
    });
  });

  it('rejects a bad body before opening a transaction', async () => {
    const { service, dataSource, manager } = build();

    await expect(service.create({ customerName: 'Ada', amount: '' })).rejects.toThrow(
      'amount must be a non-negative number',
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(manager.inserts).toHaveLength(0);
  });
});

describe('OrdersService.list', () => {
  it.each([
    [undefined, 50],
    [10, 10],
    [200, 200],
    [500, 200],
    [0, 1],
    [-5, 1],
    [NaN, 1],
    ['abc' as unknown as number, 1],
  ])('limit %p → take %p, newest first', async (limit, take) => {
    const { service, repo } = build();

    await service.list(limit);

    expect(repo.find).toHaveBeenCalledWith({ order: { createdAt: 'DESC' }, take });
  });
});
