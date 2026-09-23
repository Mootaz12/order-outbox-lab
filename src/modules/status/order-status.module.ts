import { Module } from '@nestjs/common';
import { StageEventsModule } from '../stage-events/stage-events.module';
import { OrderStatusService } from './order-status.service';

@Module({
  imports: [StageEventsModule],
  providers: [OrderStatusService],
})
export class OrderStatusModule {}
