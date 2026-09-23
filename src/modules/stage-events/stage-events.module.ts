import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderStageEventEntity } from '@modules/stage-events/entities/order-stage-event.entity';
import { StageEventsController } from '@modules/stage-events/controllers/stage-events.controller';
import { StageEventsService } from '@modules/stage-events/services/stage-events.service';

@Module({
  imports: [TypeOrmModule.forFeature([OrderStageEventEntity])],
  controllers: [StageEventsController],
  providers: [StageEventsService],
  exports: [StageEventsService],
})
export class StageEventsModule {}
