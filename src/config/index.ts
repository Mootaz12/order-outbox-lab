import { appConfig } from './app.config';
import { databaseConfig } from './database.config';
import { eventBusConfig } from './event-bus.config';

export { appConfig, AppConfig } from './app.config';
export { databaseConfig, DatabaseConfig } from './database.config';
export { eventBusConfig, EventBusConfig } from './event-bus.config';

/** Every namespace `ConfigModule.forRoot({ load })` registers. */
export const configNamespaces = [appConfig, databaseConfig, eventBusConfig];
