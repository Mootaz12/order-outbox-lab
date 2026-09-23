import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { StageName, StageStatus } from '@shared/pipeline';

/**
 * Append-only audit log — the read model the dashboard and the status watcher both
 * derive from. The unique (order_id, stage, attempt, status) index doubles as the
 * idempotency guard: a stage claims an attempt by inserting its `started` row, and a
 * delivery that arrives twice collides with it and inserts zero rows.
 */
@Entity('order_stage_events')
@Index(['orderId', 'stage', 'attempt', 'status'], { unique: true })
export class OrderStageEventEntity {
  // bigserial, not uuid: an append-only log wants a cheap, strictly increasing key —
  // which is also why this entity doesn't extend BaseEntity.
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'uuid' })
  orderId: string;

  @Column({ type: 'text' })
  stage: StageName;

  @Column({ type: 'text' })
  status: StageStatus;

  @Column({ type: 'int', default: 1 })
  attempt: number;

  @Column({ type: 'text', nullable: true })
  detail: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
