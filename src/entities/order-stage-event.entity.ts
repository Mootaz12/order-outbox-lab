import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { StageName, StageStatus } from '../common/pipeline';

/**
 * Append-only audit log — the read model the dashboard and the status watcher both
 * derive from. The unique (order_id, stage, attempt, status) index doubles as the
 * idempotency guard: a stage claims an attempt by inserting its `started` row, and a
 * delivery that arrives twice collides with it and inserts zero rows.
 */
@Entity('order_stage_events')
@Index(['orderId', 'stage', 'attempt', 'status'], { unique: true })
export class OrderStageEvent {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @Column({ type: 'text' })
  stage: StageName;

  @Column({ type: 'text' })
  status: StageStatus;

  @Column({ type: 'int', default: 1 })
  attempt: number;

  @Column({ type: 'text', nullable: true })
  detail: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
