import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { EventBusHealthIndicator } from './event-bus.health';
import { HEALTH_PING_TIMEOUT_MS, HealthKey } from './health.constants';

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
      () => this.db.pingCheck(HealthKey.Postgres, { timeout: HEALTH_PING_TIMEOUT_MS }),
      () => this.eventBus.isHealthy(HealthKey.EventBus),
    ]);
  }
}
