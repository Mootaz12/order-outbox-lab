# Documentation

Architecture and data-flow notes for order-outbox-lab. The [root README](../README.md) is the
tour (quick start, API, the reasoning behind each piece); these pages go one level deeper and
describe the code as it is in `src/`.

## Reading order

1. **[architecture.md](architecture.md)**: the deployment (nginx, three identical instances,
   Postgres, Redis, the migrator gate), the source layers, the per-feature folder layout, the
   module dependency graph, and the design decisions with the reason for each.
2. **[data-flow.md](data-flow.md)**: every path a request or event takes, one diagram each:
   order creation, the outbox relay tick, a stage attempt with retry and dead-letter, live
   updates over the event bus and SSE, status settlement. Ends with the ER diagram of the four
   tables.
3. **[operations.md](operations.md)**: running the stack, generating load, what `/health`
   checks, where to watch the `SKIP LOCKED` race in the logs, and the psql queries worth
   keeping at hand.

## Per-feature detail

Each feature folder has its own README with the detail that only matters inside it:

| Feature | README | Covers |
| --- | --- | --- |
| orders | [src/modules/orders/README.md](../src/modules/orders/README.md) | `POST /orders`, `GET /orders`, `GET /dead-letters`, input parsing |
| outbox | [src/modules/outbox/README.md](../src/modules/outbox/README.md) | `OutboxEntity`, `enqueueOutbox()`, the `SKIP LOCKED` relay |
| stages | [src/modules/stages/README.md](../src/modules/stages/README.md) | `StageRunner`, `STAGE_CONFIGS`, the handler factory, retry policy |
| stage-events | [src/modules/stage-events/README.md](../src/modules/stage-events/README.md) | the audit log, event-bus fan-out, hydration and SSE endpoints |
| status | [src/modules/status/README.md](../src/modules/status/README.md) | recomputing `orders.status` from Postgres |
| health | [src/modules/health/README.md](../src/modules/health/README.md) | the Terminus checks behind `/health` |

The load generator is documented in [tools/load-generator/README.md](../tools/load-generator/README.md).
