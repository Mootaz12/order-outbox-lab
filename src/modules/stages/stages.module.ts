import { Module } from '@nestjs/common';
import { StageEventsModule } from '../stage-events/stage-events.module';
import { STAGE_HANDLERS } from './stage-handler';

@Module({
  imports: [StageEventsModule],
  providers: STAGE_HANDLERS,
})
export class StagesModule {}
