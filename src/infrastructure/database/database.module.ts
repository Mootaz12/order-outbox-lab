import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig, DatabaseConfig } from '../../config';
import { databaseOptions } from './database-options';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [databaseConfig.KEY],
      useFactory: (config: DatabaseConfig) => databaseOptions(config),
    }),
  ],
})
export class DatabaseModule {}
