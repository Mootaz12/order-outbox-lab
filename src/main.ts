import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { appConfig, AppConfig } from '@config';

/** Boots one app instance: builds the Nest app, enables shutdown hooks, listens on all interfaces. */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  // Turns query strings into DTO instances (with their defaults) and rejects invalid ones with
  // 400; `whitelist` drops params no DTO declares. Plain-interface bodies are left untouched.
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  const { port, instanceId } = app.get<AppConfig>(appConfig.KEY);
  await app.listen(port, '0.0.0.0');

  new Logger('Bootstrap').log(`${instanceId} listening on port ${port}`);
}

void bootstrap();
