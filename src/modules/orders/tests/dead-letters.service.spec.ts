import { Repository } from 'typeorm';
import { StageRetryStatus } from '@shared/pipeline';
import { DeadLettersService } from '@modules/orders/services/dead-letters.service';
import { StageRetryEntity } from '@modules/stages/entities/stage-retry.entity';

describe('DeadLettersService.list', () => {
  it('asks only for dead-lettered rows, most retries first', async () => {
    const repo = { find: jest.fn(async () => []) };
    const service = new DeadLettersService(repo as unknown as Repository<StageRetryEntity>);

    await service.list();

    expect(repo.find).toHaveBeenCalledWith({
      where: { status: StageRetryStatus.DeadLettered },
      order: { retryCount: 'DESC' },
    });
  });
});
