import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderStageEventEntity } from '@modules/stage-events/entities/order-stage-event.entity';
import { StageEventsController } from '@modules/stage-events/controllers/stage-events.controller';
import { StageEventHistoryService } from '@modules/stage-events/services/stage-event-history.service';
import { StageEventsService } from '@modules/stage-events/services/stage-events.service';

@Module({
  imports: [TypeOrmModule.forFeature([OrderStageEventEntity])],
  controllers: [StageEventsController],
  providers: [StageEventsService, StageEventHistoryService],
  exports: [StageEventsService],
})
export class StageEventsModule {}
