import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { EventBusHealthIndicator } from '@modules/health/services/event-bus-health.indicator';
import { HEALTH_PING_TIMEOUT_MS, HealthKey } from '@modules/health/consts/health.constants';

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
