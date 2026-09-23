import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { DatabaseConfig } from '@config';
import { SOURCE_EXT } from './database.constants';

/**
 * TypeORM options shared by the Nest app and the migrator; entities come from the
 * `*.entity.ts` glob, so neither side registers them by hand (see docs/architecture.md).
 */
export function databaseOptions(config: DatabaseConfig): PostgresConnectionOptions {
  return {
    type: 'postgres',
    url: config.url,
    entities: [__dirname + `/../../**/*.entity.${SOURCE_EXT}`],
    // camelCase properties map to snake_case columns, so entities don't spell out column
    // names. Table names stay explicit in @Entity(): the class names end in `Entity`.
    namingStrategy: new SnakeNamingStrategy(),
    // Schema comes from migrations, applied by the one-shot `migrator` service that
    // the app instances wait on. Three instances inferring schema at boot would
    // race each other to CREATE TABLE the same objects.
    synchronize: false,
  };
}
