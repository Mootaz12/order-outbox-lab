import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderStageEvent } from '../entities/order-stage-event.entity';
import { OrderEventsController } from './order-events.controller';
import { StageEventsService } from './stage-events.service';

@Module({
  imports: [TypeOrmModule.forFeature([OrderStageEvent])],
  controllers: [OrderEventsController],
  providers: [StageEventsService],
  exports: [StageEventsService],
})
export class OrderEventsModule {}
