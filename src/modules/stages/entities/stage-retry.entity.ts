import { Column, Entity, PrimaryColumn } from 'typeorm';
import { StageName, StageRetryStatus } from '@shared/pipeline';

/**
 * One row per (order, stage): how many times that stage has failed and whether it gave up.
 * No base class — its key is the composite (order_id, stage) and it has no created_at.
 */
@Entity('stage_retries')
export class StageRetryEntity {
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
