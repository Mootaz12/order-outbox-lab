import { Column, Entity } from 'typeorm';
import { BaseEntity } from '@base/base-entity';
import { OrderStatus } from '@shared/pipeline';

@Entity('orders')
export class OrderEntity extends BaseEntity {
  @Column({ name: 'customer_name', type: 'text' })
  customerName: string;

  // Postgres `numeric` is returned as a string by the driver to avoid precision loss.
  @Column({ type: 'numeric' })
  amount: string;

  @Column({ type: 'text', default: OrderStatus.Pending })
  status: OrderStatus;
}
