import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from '@modules/health/controllers/health.controller';
import { EventBusHealthIndicator } from '@modules/health/services/event-bus-health.indicator';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [EventBusHealthIndicator],
})
export class HealthModule {}
