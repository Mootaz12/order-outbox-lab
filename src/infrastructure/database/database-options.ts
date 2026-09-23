import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { DatabaseConfig } from '../../config';
import { SOURCE_EXT } from './database.constants';


/**
 * Connection options shared by the Nest app and the migrator's DataSource, so the two
 * can't drift. Entities are found by glob rather than listed, so a new `*.entity.ts`
 * anywhere under src/ is picked up by both without touching this file.
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
