import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { EventBusHealthIndicator } from './event-bus.health';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly eventBus: EventBusHealthIndicator,
  ) {}

  /**
   * Pings both stateful dependencies, so a container that is up but cut off from
   * Postgres or the event bus reports unhealthy and nginx stops routing to it.
   */
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('postgres', { timeout: 1500 }),
      () => this.eventBus.isHealthy('eventBus'),
    ]);
  }
}
