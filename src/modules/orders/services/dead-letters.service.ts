import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StageRetryStatus } from '@shared/pipeline';
import { StageRetryEntity } from '@modules/stages/entities/stage-retry.entity';

/**
 * Read-only view of `stage_retries` rows that hit the retry cap. StagesModule owns
 * the writes; this only serves them over HTTP next to the orders they belong to.
 */
@Injectable()
export class DeadLettersService {
  constructor(
    @InjectRepository(StageRetryEntity) private readonly retries: Repository<StageRetryEntity>,
  ) {}

  list() {
    return this.retries.find({
      where: { status: StageRetryStatus.DeadLettered },
      order: { retryCount: 'DESC' },
    });
  }
}
