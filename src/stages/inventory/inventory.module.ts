import { Module } from '@nestjs/common';
import { OrderEventsModule } from '../../order-events/order-events.module';
import { InventoryService } from './inventory.service';

@Module({
  imports: [OrderEventsModule],
  providers: [InventoryService],
})
export class InventoryModule {}
