import { Module } from '@nestjs/common';
import { OutboxRelayService } from '@modules/outbox/services/outbox-relay.service';

@Module({
  providers: [OutboxRelayService],
})
export class OutboxModule {}
