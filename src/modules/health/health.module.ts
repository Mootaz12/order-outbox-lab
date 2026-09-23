import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { EventBusHealthIndicator } from './event-bus.health';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [EventBusHealthIndicator],
})
export class HealthModule {}
