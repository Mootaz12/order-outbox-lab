import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { StageName } from '../common/pipeline';
import { Order } from './order.entity';

export interface OutboxPayload {
  orderId: string;
  stage: StageName | null;
  attempt: number;
}

/**
 * The transactional outbox. `stage = NULL` means "fan this order out to all three
 * stages"; a stage name means "retry only this stage". `availableAt` implements
 * retry backoff in the database rather than in a process-local timer.
 */
@Entity('outbox')
@Index(['processed', 'availableAt'])
export class Outbox {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ type: 'jsonb' })
  payload: OutboxPayload;

  @Column({ type: 'text', nullable: true })
  stage: StageName | null;

  @Column({ type: 'boolean', default: false })
  processed: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'available_at', type: 'timestamptz', default: () => 'now()' })
  availableAt: Date;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;
}
