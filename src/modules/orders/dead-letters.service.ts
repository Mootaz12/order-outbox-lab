import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StageRetryStatus } from '../../shared/pipeline';
import { StageRetry } from '../stages/stage-retry.entity';

/**
 * Read-only view of `stage_retries` rows that hit the retry cap. StagesModule owns
 * the writes; this only serves them over HTTP next to the orders they belong to.
 */
@Injectable()
export class DeadLettersService {
  constructor(
    @InjectRepository(StageRetry) private readonly retries: Repository<StageRetry>,
  ) {}

  list() {
    return this.retries.find({
      where: { status: StageRetryStatus.DeadLettered },
      order: { retryCount: 'DESC' },
    });
  }
}
