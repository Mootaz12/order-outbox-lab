import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { env } from '../common/env';

// The TypeORM CLI runs these files through ts-node (so the glob must match .ts),
// while the container runs the compiled output (where it must match .js).
const ext = __filename.endsWith('.ts') ? 'ts' : 'js';

export function createDataSource(): DataSource {
  return new DataSource({
    type: 'postgres',
    url: env.databaseUrl,
    entities: [__dirname + `/../**/*.entity.${ext}`],
    migrations: [__dirname + `/migrations/*.${ext}`],
    synchronize: false,
    logging: ['error', 'warn', 'migration'],
  });
}
