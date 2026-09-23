import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@base/base-entity';
import { StageName } from '@shared/pipeline';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OutboxPayload } from '@modules/outbox/types/outbox.types';

/**
 * The transactional outbox. `stage = NULL` means "fan this order out to all three
 * stages"; a stage name means "retry only this stage". `availableAt` implements
 * retry backoff in the database rather than in a process-local timer.
 */
@Entity('outbox')
@Index(['processed', 'availableAt'])
export class OutboxEntity extends BaseEntity {
  @Column({ type: 'uuid' })
  orderId: string;

  @ManyToOne(() => OrderEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: OrderEntity;

  @Column({ type: 'jsonb' })
  payload: OutboxPayload;

  @Column({ type: 'text', nullable: true })
  stage: StageName | null;

  @Column({ type: 'boolean', default: false })
  processed: boolean;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  availableAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  processedAt: Date | null;
}
