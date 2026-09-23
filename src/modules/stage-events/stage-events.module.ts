import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderStageEvent } from './order-stage-event.entity';
import { StageEventsController } from './stage-events.controller';
import { StageEventsService } from './stage-events.service';

@Module({
  imports: [TypeOrmModule.forFeature([OrderStageEvent])],
  controllers: [StageEventsController],
  providers: [StageEventsService],
  exports: [StageEventsService],
})
export class StageEventsModule {}
