import { ConfigType, registerAs } from '@nestjs/config';

/** Settings for the cross-instance event bus driver (Redis today). */
export const eventBusConfig = registerAs('eventBus', () => ({
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
}));

export type EventBusConfig = ConfigType<typeof eventBusConfig>;
