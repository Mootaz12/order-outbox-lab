import { Module } from '@nestjs/common';
import { OrderEventsModule } from '../order-events/order-events.module';
import { OrderStatusService } from './order-status.service';

@Module({
  imports: [OrderEventsModule],
  providers: [OrderStatusService],
})
export class OrderStatusModule {}
