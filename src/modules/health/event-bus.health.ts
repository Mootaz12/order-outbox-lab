import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { EventBus } from '../../infrastructure/event-bus/event-bus';
import { HEALTH_PING_TIMEOUT_MS } from './health.constants';

/**
 * Postgres being reachable is not enough: if the event bus is down the app still serves
 * requests and writes rows, but SSE goes silent and the dashboard stops updating
 * while every container reports healthy.
 */
@Injectable()
export class EventBusHealthIndicator extends HealthIndicator {
  constructor(private readonly bus: EventBus) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.bus.ping(HEALTH_PING_TIMEOUT_MS);
      return this.getStatus(key, true);
    } catch (error) {
      return this.getStatus(key, false, {
        message: (error as Error).message,
      });
    }
  }
}
