import { plainToInstance } from 'class-transformer';
import { Repository } from 'typeorm';
import { Order } from '@shared/order.enum';
import { StageName, StageRetryStatus } from '@shared/pipeline';
import { ListDeadLettersQueryDto } from '@modules/orders/dtos/list-dead-letters-query.dto';
import { DeadLettersService } from '@modules/orders/services/dead-letters.service';
import { StageRetryEntity } from '@modules/stages/entities/stage-retry.entity';

/** Builds the service over a repository whose find() records its options. */
function build() {
  const repo = { find: jest.fn(async () => []) };
  return { repo, service: new DeadLettersService(repo as unknown as Repository<StageRetryEntity>) };
}

describe('DeadLettersService.list', () => {
  it('asks only for dead-lettered rows, most retries first, default page size', async () => {
    const { repo, service } = build();

    await service.list(plainToInstance(ListDeadLettersQueryDto, {}));

    expect(repo.find).toHaveBeenCalledWith({
      where: { status: StageRetryStatus.DeadLettered },
      order: { retryCount: Order.Desc },
      take: 50,
    });
  });

  it('narrows to one stage and honours the requested order and limit', async () => {
    const { repo, service } = build();

    await service.list(
      plainToInstance(ListDeadLettersQueryDto, { stage: StageName.Payment, order: Order.Asc, limit: 5 }),
    );

    expect(repo.find).toHaveBeenCalledWith({
      where: { status: StageRetryStatus.DeadLettered, stage: StageName.Payment },
      order: { retryCount: Order.Asc },
      take: 5,
    });
  });
});
