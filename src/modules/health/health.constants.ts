/** Per-dependency ping deadline; two checks must fit inside the 5s Compose healthcheck. */
export const HEALTH_PING_TIMEOUT_MS = 1500;

/** Keys in the `/health` response body. */
export enum HealthKey {
  Postgres = 'postgres',
  EventBus = 'eventBus',
}
