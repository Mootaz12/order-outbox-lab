import { ConfigType, registerAs } from '@nestjs/config';

/**
 * The default makes `pnpm start:dev` work against `docker compose up -d db redis migrator`.
 * The migrator runs outside Nest's DI and calls `databaseConfig()` directly — a
 * `registerAs` factory is a plain function as well as a config namespace.
 */
export const databaseConfig = registerAs('database', () => ({
  url: process.env.DATABASE_URL ?? 'postgres://app:app@localhost:5432/orders',
}));

export type DatabaseConfig = ConfigType<typeof databaseConfig>;
