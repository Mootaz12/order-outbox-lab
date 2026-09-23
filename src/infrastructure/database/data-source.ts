import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { databaseConfig } from '../../config';
import { databaseOptions, ext } from './database-options';

/** Used by the migrator, which runs outside Nest — hence calling the config factory directly. */
export function createDataSource(): DataSource {
  return new DataSource({
    ...databaseOptions(databaseConfig()),
    migrations: [__dirname + `/migrations/*.${ext}`],
    logging: ['error', 'warn', 'migration'],
  });
}
