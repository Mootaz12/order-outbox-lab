/**
 * Every environment read in one place, with the default that makes `npm run start:dev`
 * work against `docker compose up -d db redis migrator`.
 */
export const env = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://app:app@localhost:5432/orders',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  /** Distinguishes the three Compose replicas in logs and on the dashboard. */
  instanceId: process.env.INSTANCE_ID ?? 'instance-local',
  port: Number(process.env.PORT ?? 3000),
};
