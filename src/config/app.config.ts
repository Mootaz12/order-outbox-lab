import { ConfigType, registerAs } from '@nestjs/config';
import { positiveInt } from './parse';

/**
 * Process-level settings. Injected as `ConfigType<typeof appConfig>` via
 * `@Inject(appConfig.KEY)`, so every field is typed at the point of use.
 */
export const appConfig = registerAs('app', () => ({
  /** Distinguishes the three Compose replicas in logs and on the dashboard. */
  instanceId: process.env.INSTANCE_ID ?? 'instance-local',
  port: positiveInt('PORT', process.env.PORT, 3000),
}));

export type AppConfig = ConfigType<typeof appConfig>;
