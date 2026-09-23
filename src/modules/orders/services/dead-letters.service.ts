import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StageRetryStatus } from '@shared/pipeline';
import { StageRetryEntity } from '@modules/stages/entities/stage-retry.entity';
import { ListDeadLettersQueryDto } from '@modules/orders/dtos/list-dead-letters-query.dto';

/**
 * Read-only view of `stage_retries` rows that hit the retry cap. StagesModule owns
 * the writes; this only serves them over HTTP next to the orders they belong to.
 */
@Injectable()
export class DeadLettersService {
  constructor(
    @InjectRepository(StageRetryEntity) private readonly retries: Repository<StageRetryEntity>,
  ) {}

  /** Returns up to `query.limit` dead-lettered rows sorted by `retry_count`, optionally one stage. */
  list(query: ListDeadLettersQueryDto): Promise<StageRetryEntity[]> {
    return this.retries.find({
      where: {
        status: StageRetryStatus.DeadLettered,
        ...(query.stage ? { stage: query.stage } : {}),
      },
      order: { retryCount: query.order },
      take: query.limit,
    });
  }
}
