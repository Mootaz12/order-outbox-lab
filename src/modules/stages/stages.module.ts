import { Module } from '@nestjs/common';
import { StageEventsModule } from '@modules/stage-events/stage-events.module';
import { STAGE_HANDLERS } from '@modules/stages/services/stage-handler.factory';

@Module({
  imports: [StageEventsModule],
  providers: STAGE_HANDLERS,
})
export class StagesModule {}
