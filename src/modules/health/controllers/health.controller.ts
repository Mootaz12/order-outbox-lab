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

  /** Pings Postgres and the event bus; either failing makes `/health` report unhealthy. */
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck(HealthKey.Postgres, { timeout: HEALTH_PING_TIMEOUT_MS }),
      () => this.eventBus.isHealthy(HealthKey.EventBus),
    ]);
  }
}
