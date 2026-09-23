import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { DatabaseConfig } from '../../config';

// The TypeORM CLI runs these files through ts-node (so the glob must match .ts),
// while the container runs the compiled output (where it must match .js).
export const ext = __filename.endsWith('.ts') ? 'ts' : 'js';

/**
 * Connection options shared by the Nest app and the migrator's DataSource, so the two
 * can't drift. Entities are found by glob rather than listed, so a new `*.entity.ts`
 * anywhere under src/ is picked up by both without touching this file.
 */
export function databaseOptions(config: DatabaseConfig): PostgresConnectionOptions {
  return {
    type: 'postgres',
    url: config.url,
    entities: [__dirname + `/../../**/*.entity.${ext}`],
    // Schema comes from migrations, applied by the one-shot `migrator` service that
    // the app instances wait on. Three instances inferring schema at boot would
    // race each other to CREATE TABLE the same objects.
    synchronize: false,
  };
}
