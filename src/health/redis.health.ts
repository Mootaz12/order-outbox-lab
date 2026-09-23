import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { RedisService } from '../redis/redis.service';

/**
 * Postgres being reachable is not enough: if Redis is down the app still serves
 * requests and writes rows, but SSE goes silent and the dashboard stops updating
 * while every container reports healthy.
 */
@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(private readonly redis: RedisService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.redis.ping();
      return this.getStatus(key, true);
    } catch (error) {
      return this.getStatus(key, false, {
        message: (error as Error).message,
      });
    }
  }
}
