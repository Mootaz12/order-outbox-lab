# health

`GET /health` for the Compose healthcheck and nginx: reports unhealthy when the container is
up but cut off from Postgres or the event bus.

## Routes

- `GET /health` — Terminus check with two keys (`HealthKey`): `postgres` (TypeORM ping) and
  `eventBus` (`EventBus.ping`). Each has a `HEALTH_PING_TIMEOUT_MS` (1500 ms) deadline.

## Files

- `health.module.ts` — imports `TerminusModule`.
- `controllers/health.controller.ts` — runs both checks.
- `services/event-bus-health.indicator.ts` — `EventBusHealthIndicator`: up/down from `ping()`.
- `consts/health.constants.ts` — `HEALTH_PING_TIMEOUT_MS`, `HealthKey`.
- `tests/event-bus-health.indicator.spec.ts` — fake bus: up, down with message, deadline passed.

## Invariants and why

- **Both stateful dependencies are pinged.** A container that is up but cut off from either
  reports unhealthy, so nginx stops routing to it.
- **The event bus matters even though Postgres holds the truth.** With the bus down the app
  still accepts orders and writes rows, but SSE goes silent and the dashboard freezes while
  every container would otherwise look healthy.
- **Timeout budget:** two 1.5 s pings must fit inside the 5 s Compose healthcheck.
- A failed ping is reported as `down` with the error message, never thrown out of the indicator.

## Talks to

- `@infrastructure/event-bus` (abstract `EventBus`, never ioredis) and TypeORM's connection.
