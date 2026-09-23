import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { databaseConfig } from '@config';
import { databaseOptions } from './database-options';
import { SOURCE_EXT } from './database.constants';

/** Used by the migrator, which runs outside Nest — hence calling the config factory directly. */
export function createDataSource(): DataSource {
  return new DataSource({
    ...databaseOptions(databaseConfig()),
    migrations: [__dirname + `/migrations/*.${SOURCE_EXT}`],
    logging: ['error', 'warn', 'migration'],
  });
}
