import { Column, Entity, PrimaryColumn } from 'typeorm';
import { StageName, StageRetryStatus } from '../common/pipeline';

/** One row per (order, stage): how many times that stage has failed and whether it gave up. */
@Entity('stage_retries')
export class StageRetry {
  @PrimaryColumn({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @PrimaryColumn({ type: 'text' })
  stage: StageName;

  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount: number;

  @Column({ type: 'text', default: StageRetryStatus.Pending })
  status: StageRetryStatus;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;
}
