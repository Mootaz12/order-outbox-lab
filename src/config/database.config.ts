import { ConfigType, registerAs } from '@nestjs/config';

/**
 * Postgres connection URL; the default matches `docker compose up -d db redis migrator`.
 * Also called directly as `databaseConfig()` by the migrator (see docs/architecture.md).
 */
export const databaseConfig = registerAs('database', () => ({
  url: process.env.DATABASE_URL ?? 'postgres://app:app@localhost:5432/orders',
}));

export type DatabaseConfig = ConfigType<typeof databaseConfig>;
