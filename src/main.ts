import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { env } from './common/env';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  await app.listen(env.port, '0.0.0.0');

  new Logger('Bootstrap').log(`${env.instanceId} listening on port ${env.port}`);
}

void bootstrap();
