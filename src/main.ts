import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { appConfig, AppConfig } from '@config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  const { port, instanceId } = app.get<AppConfig>(appConfig.KEY);
  await app.listen(port, '0.0.0.0');

  new Logger('Bootstrap').log(`${instanceId} listening on port ${port}`);
}

void bootstrap();
