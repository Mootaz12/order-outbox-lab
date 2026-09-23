import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
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
    // Schema comes from migrations, applied by the one-shot `migrator` service that
    // the app instances wait on. Three instances inferring schema at boot would
    // race each other to CREATE TABLE the same objects.
    synchronize: false,
  };
}
