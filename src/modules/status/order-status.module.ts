import { Module } from '@nestjs/common';
import { StageEventsModule } from '@modules/stage-events/stage-events.module';
import { OrderStatusService } from '@modules/status/services/order-status.service';

@Module({
  imports: [StageEventsModule],
  providers: [OrderStatusService],
})
export class OrderStatusModule {}
