# orders

The HTTP entry point of the pipeline. `POST /orders` validates the body, inserts the
`orders` row and its first (untagged) outbox row in **one transaction**, and returns `201`
straight away with the order still `pending` — nothing downstream has run yet, and that is
the intended contract, not a shortcoming. It also serves read-only lists of orders and of
dead-lettered stage retries. It never changes `orders.status` after creation; the status
feature owns that.

## Routes

| Route | Handler | Returns |
| --- | --- | --- |
| `POST /orders` `{ customerName, amount }` | `OrdersController.create` → `OrdersService.create` | `201` `CreatedOrder` (`id, customerName, amount, status: 'pending'`); `400` on a bad body |
| `GET /orders?limit=&order=&status=` | `OrdersController.list` → `OrdersService.list` | `ListOrdersQueryDto`: sorted by `created_at` (default `Desc`), optional `status`; bad params → 400 |
| `GET /dead-letters?limit=&order=&stage=` | `DeadLettersController.list` → `DeadLettersService.list` | `ListDeadLettersQueryDto`: `dead_lettered` rows sorted by `retry_count` (default `Desc`), optional `stage` |

Events: emits none directly. Its outbox row later becomes `order.created` via the outbox relay.

## Files

- `orders.module.ts` — registers `OrderEntity` and `StageRetryEntity` repositories.
- `controllers/` — `orders.controller.ts`, `dead-letters.controller.ts` (thin; no logic).
- `dtos/` — `list-orders-query.dto.ts`, `list-dead-letters-query.dto.ts` (extend `@base/base-query.dto`: `limit` 1–200 default 50, `order`).
- `services/` — `orders.service.ts` (create + list), `dead-letters.service.ts` (read-only).
- `helpers/parse-create-order.helper.ts` — hand-written body validation (there are no DTO classes).
- `entities/order.entity.ts` — `OrderEntity` on `orders` (extends `@base/base-entity`).
- `types/orders.types.ts` — `CreateOrderBody` (untrusted, all `unknown`), `CreateOrderInput`, `CreatedOrder`.
- `consts/orders.constants.ts` — `FIRST_ATTEMPT = 1` (page-size limits now live in `@base/base.constants`).
- `tests/` — parser, `OrdersService` (create transaction + list clamping), `DeadLettersService`, all with in-memory fakes.

## Invariants and why

- **Order and outbox row commit together.** `create` calls `enqueueOutbox(manager, …)` with
  the transaction's own manager, so the event exists if and only if the order does.
- **Validation runs before the transaction.** `parseCreateOrder` throws `BadRequestException`
  on the first bad field, so a rejected body never opens a DB transaction.
- **Amount is checked as text and as a number.** `Number(null)`, `Number('')` and
  `Number('  ')` are all `0`, so coercion alone would accept an order with no amount. Only
  `number`/`string` are accepted; the trimmed text must be non-empty and the value finite
  and `>= 0`. It is stored as `toFixed(2)` text, because Postgres `numeric` comes back from
  the driver as a string.
- **`attempt` starts at 1** (`FIRST_ATTEMPT`) — it is a human-facing column.
- **Dead letters are read here, written elsewhere.** `stage_retries` belongs to the stages
  feature; this feature only lists it next to the orders it refers to.

## Talks to

- **outbox** — `enqueueOutbox()` (`@modules/outbox/helpers/enqueue-outbox.helper`) is the only way it writes an outbox row.
- **stages** — reads `StageRetryEntity` for `GET /dead-letters`.
- **status** — updates `orders.status` later, guarded by `WHERE status = 'pending'`.
- **shared** — `OrderStatus`, `StageRetryStatus` from `@shared/pipeline`.
