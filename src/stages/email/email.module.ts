import { Module } from '@nestjs/common';
import { OrderEventsModule } from '../../order-events/order-events.module';
import { EmailService } from './email.service';

@Module({
  imports: [OrderEventsModule],
  providers: [EmailService],
})
export class EmailModule {}
