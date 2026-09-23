import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { OrderStatus } from '../common/pipeline';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'customer_name', type: 'text' })
  customerName: string;

  // Postgres `numeric` is returned as a string by the driver to avoid precision loss.
  @Column({ type: 'numeric' })
  amount: string;

  @Column({ type: 'text', default: OrderStatus.Pending })
  status: OrderStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
