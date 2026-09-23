import { Module } from '@nestjs/common';
import { OrderEventsModule } from '../../order-events/order-events.module';
import { PaymentService } from './payment.service';

@Module({
  imports: [OrderEventsModule],
  providers: [PaymentService],
})
export class PaymentModule {}
