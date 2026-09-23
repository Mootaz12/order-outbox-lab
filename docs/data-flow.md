# Data flow

Every path a request or event takes through the system, in the order an order experiences
them. Each section names the code that implements it. For why the pieces exist, see
[architecture.md](architecture.md).

The whole journey in one picture:

```mermaid
flowchart LR
    post["POST /orders"] -->|"a. one transaction"| tables[("orders + outbox")]
    tables -->|"b. relay tick<br/>SKIP LOCKED"| emit["in-process event<br/>order.created or stage.retry"]
    emit -->|"c. stage attempt"| audit[("order_stage_events<br/>stage_retries")]
    emit -.->|"c. failure: retry row"| tables
    audit -->|"d. publish after write"| bus["EventBus<br/>Redis stage_events"]
    bus -->|"d. every instance"| sse["SSE clients"]
    bus -->|"e. settled frames"| status["orders.status"]
```

## a. Order creation

`OrdersController.create` → `OrdersService.create` → `enqueueOutbox()`.

```mermaid
sequenceDiagram
    autonumber
    participant C as client
    participant N as nginx
    participant A as any instance
    participant P as Postgres

    C->>N: POST /orders {customerName, amount}
    N->>A: round-robin
    A->>A: parseCreateOrder() validates, 400 on the first bad field
    A->>P: BEGIN
    A->>P: INSERT orders (status = pending)
    A->>P: INSERT outbox (stage = NULL, payload {orderId, stage null, attempt 1})
    A->>P: COMMIT
    A-->>C: 201 {id, customerName, amount, status}
    Note over A,P: Nothing downstream has run yet. The outbox row exists iff the order does.
```

The untagged outbox row (`stage IS NULL`) means "fan this order out to every stage". Its
`available_at` defaults to `now()`, so the next relay tick on any instance can claim it.
Detail: [src/modules/orders/README.md](../src/modules/orders/README.md).

## b. Outbox relay tick

`OutboxRelayService.poll` runs on `@Interval(2000)` on every instance. A `running` flag stops
one instance's ticks from overlapping.

```mermaid
sequenceDiagram
    autonumber
    participant R as OutboxRelayService (instance-N)
    participant P as Postgres
    participant E as EventEmitter2 (same process)
    participant S as stage handlers (same process)

    R->>P: BEGIN
    R->>P: SELECT * FROM outbox WHERE processed = false AND available_at <= now() ORDER BY created_at, id LIMIT 50 FOR UPDATE SKIP LOCKED
    P-->>R: up to 50 rows the other instances are not holding
    loop each claimed row
        alt stage IS NULL
            R->>E: emit order.created (payload)
        else stage is set
            R->>E: emit stage.retry, e.g. payment.retry (payload)
        end
        E-)S: handler starts, promise NOT awaited
    end
    R->>P: UPDATE outbox SET processed = true, processed_at = now(), updated_at = now() WHERE id IN (...)
    R->>P: COMMIT
    R->>R: log "[instance-N] poller tick — locked K row(s)"
```

Points that follow from this shape:

- **Rows are marked processed before any stage finishes.** The emit returns immediately; the
  stages run concurrently in the same process after the relay's transaction commits. Stages
  never touch the outbox row they came from.
- **At-least-once.** Events are emitted before the commit that marks their rows processed; if
  that commit fails, the rows are claimed again on a later tick and re-emitted. Stage-level
  idempotency (section c) absorbs the duplicate.
- **A lost attempt stays lost.** If the instance dies mid-stage, the row is already processed
  and nothing re-enqueues it (no visibility timeout).
- **Work stays on the claiming instance.** All three stages of an untagged row run on the
  instance that claimed it; a retry is a new row and may be claimed anywhere.

Detail: [src/modules/outbox/README.md](../src/modules/outbox/README.md).

## c. Stage attempt

`StageHandler.onOrderCreated` / `onRetry` → `StageRunner.run` → `attempt` → `claim`,
`record`, `fail`, `publish`. `run()` catches everything: eventemitter2 discards the handler's
promise, and an unhandled rejection would exit the Node 20 process.

```mermaid
flowchart TD
    arrive(["order.created or stage.retry<br/>payload: orderId, attempt"]) --> claim{"INSERT order_stage_events<br/>status = started<br/>ON CONFLICT DO NOTHING<br/>row inserted?"}
    claim -->|"no: duplicate delivery"| skip(["log debug, return"])
    claim -->|yes| pubStart["publish started frame"]
    pubStart --> work["sleep simulatedDelayMs<br/>between minDelayMs and maxDelayMs"]
    work --> roll{"random roll<br/>below failureRate?"}
    roll -->|no| rec["INSERT completed row<br/>detail = duration"]
    rec --> pubOk["publish completed frame"]
    pubOk --> done(["log ok"])
    roll -->|yes| txn["BEGIN"]
    txn --> f1["INSERT failed row<br/>detail = error"]
    f1 --> f2["UPSERT stage_retries<br/>retry_count + 1, last_error<br/>RETURNING retry_count"]
    f2 --> dec{"retry_count >= MAX_RETRIES (3)?"}
    dec -->|"no: Retry"| q["enqueueOutbox()<br/>stage = this stage<br/>attempt = attempt + 1<br/>available_at = now + attempt x 1s"]
    dec -->|"yes: DeadLetter"| dl["UPDATE stage_retries<br/>status = dead_lettered"]
    q --> commit["COMMIT"]
    dl --> commit
    commit --> pubFail["publish failed frame<br/>(after the commit)"]
    pubFail --> back(["retry row re-enters section b<br/>possibly on another instance"])
```

The attempt/retry lifecycle of one `(order, stage)` pair:

```mermaid
stateDiagram-v2
    [*] --> Attempt1: order.created
    Attempt1 --> Done: completed
    Attempt1 --> Attempt2: failed, retry_count 1, backoff 1s
    Attempt2 --> Done: completed
    Attempt2 --> Attempt3: failed, retry_count 2, backoff 2s
    Attempt3 --> Done: completed
    Attempt3 --> DeadLettered: failed, retry_count 3
    Done --> [*]
    DeadLettered --> [*]
```

Notes:

- The `completed` insert and its publish are not in a transaction: a single insert needs none.
  `record()` uses `ON CONFLICT DO NOTHING` there too, so a duplicate reaching `completed`
  does not throw on a row that is already correct.
- Publishing is best-effort: a failed publish logs a warning and the attempt carries on,
  because Postgres already has the row.
- Backoff lives in the database (`available_at`), so restarting an instance mid-backoff loses
  nothing.

Detail: [src/modules/stages/README.md](../src/modules/stages/README.md).

## d. Live updates

Every stage-event row is followed by a `StageEventFrame` published to `EventChannel.StageEvents`
(`stage_events`). Every instance subscribes, including to its own messages, and feeds its local
SSE connections from that one subscription.

```mermaid
sequenceDiagram
    autonumber
    participant W as StageRunner (instance-2)
    participant SE2 as StageEventsService (instance-2)
    participant R as Redis
    participant SE1 as StageEventsService (instance-1)
    participant SE3 as StageEventsService (instance-3)
    participant B as browser (SSE on instance-1)

    W->>SE2: publish(frame)
    SE2->>R: PUBLISH stage_events JSON
    par broadcast to every subscriber
        R-->>SE1: message
        R-->>SE2: message (its own, same code path)
        R-->>SE3: message
    end
    SE1->>SE1: subject.next(frame), forOrder(orderId) filter
    SE1-->>B: SSE event "stage", data = frame
    Note over SE2,SE3: No matching SSE client there, the frame only feeds the status watcher (section e)
```

### Dashboard: hydrate, then subscribe

`public/js/app.js` `select(id)`:

```mermaid
sequenceDiagram
    autonumber
    participant U as user
    participant D as dashboard (app.js)
    participant N as nginx
    participant A as instance X
    participant Y as instance Y
    participant P as Postgres

    U->>D: click an order in the sidebar
    D->>D: close previous EventSource, clear timeline
    D->>N: GET /orders/:id/stages
    N->>A: round-robin
    A->>P: SELECT order_stage_events WHERE order_id ORDER BY id
    A-->>D: rows so far, each rendered by addRow()
    D->>N: new EventSource /orders/:id/stream
    N->>Y: round-robin, may differ from X
    loop until another order is selected
        Y-->>D: stage frame, rendered by addRow()
    end
```

The stream only carries what happens from the moment it opens, which is why hydration comes
first. Hydration rows and SSE frames share one shape (including `createdAt`), so both render
through `addRow()`. There is no replay or de-duplication: a frame published between the
hydration query and the stream opening can be missed (or, if its row was committed just
before the query and published just after the stream opened, shown twice). Reselecting the
order re-hydrates from Postgres, which is always authoritative. The sidebar separately polls
`GET /orders` and `GET /dead-letters` every 2s.

Detail: [src/modules/stage-events/README.md](../src/modules/stage-events/README.md).

## e. Status settlement

`OrderStatusService` subscribes to `StageEventsService.settled()`: every frame except
`started`, since a `started` row can never change an order's status. Because the event bus
broadcasts, **every instance** runs the recompute for every settled frame; the guard makes the
repeats harmless.

```mermaid
sequenceDiagram
    autonumber
    participant SE as StageEventsService (every instance)
    participant OS as OrderStatusService
    participant P as Postgres

    SE->>OS: settled frame (completed or failed)
    OS->>P: UPDATE orders SET status = fulfilled, updated_at = now() WHERE id = $1 AND status = pending AND count(DISTINCT completed stage) = 3
    OS->>P: UPDATE orders SET status = failed, updated_at = now() WHERE id = $1 AND status = pending AND EXISTS dead_lettered stage_retries row
    Note over OS,P: Both guarded by status = pending, so duplicates and other instances change nothing
```

```mermaid
stateDiagram-v2
    [*] --> pending: POST /orders committed
    pending --> fulfilled: 3 distinct stages completed
    pending --> failed: any stage dead_lettered
    fulfilled --> [*]
    failed --> [*]
```

A recompute error is logged and dropped; the next settled frame for that order recomputes
from scratch. Detail: [src/modules/status/README.md](../src/modules/status/README.md).

## Schema

Four tables, from `src/infrastructure/database/migrations/` (`InitSchema`, then
`AddAuditColumns` for `updated_at`/`deleted_at` on the two `BaseEntity` tables).

```mermaid
erDiagram
    orders ||--o{ outbox : "enqueues"
    orders ||--o{ order_stage_events : "logs"
    orders ||--o{ stage_retries : "counts failures"

    orders {
        uuid id PK "gen_random_uuid()"
        text customer_name
        numeric amount
        text status "pending, fulfilled, failed"
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at "nullable, soft delete"
    }

    outbox {
        uuid id PK "gen_random_uuid()"
        uuid order_id FK "ON DELETE CASCADE"
        jsonb payload "orderId, stage, attempt"
        text stage "NULL means all stages"
        boolean processed "default false"
        timestamptz created_at
        timestamptz available_at "default now(), retry backoff"
        timestamptz processed_at "nullable"
        timestamptz updated_at
        timestamptz deleted_at "nullable, soft delete"
    }

    order_stage_events {
        bigserial id PK
        uuid order_id FK "ON DELETE CASCADE"
        text stage "payment, inventory, email"
        text status "started, completed, failed"
        int attempt "default 1"
        text detail "nullable"
        timestamptz created_at
    }

    stage_retries {
        uuid order_id PK, FK "ON DELETE CASCADE"
        text stage PK
        int retry_count "default 0"
        text status "pending, dead_lettered"
        text last_error "nullable"
    }
```

| Table | Keys and indexes | Written by |
| --- | --- | --- |
| `orders` | PK `id` | `OrdersService.create` (insert), `OrderStatusService` (status `UPDATE`s) |
| `outbox` | PK `id`; `idx_outbox_claimable (processed, available_at)` matches the claim predicate | `enqueueOutbox()` (insert), `OutboxRelayService` (mark processed) |
| `order_stage_events` | PK `id`; `uq_stage_attempt UNIQUE (order_id, stage, attempt, status)` is the idempotency guard | `StageRunner.record()` only, append-only |
| `stage_retries` | PK `(order_id, stage)` | `StageRunner.fail()` (upsert, dead-letter) |

`orders` and `outbox` extend `BaseEntity`: TypeORM stamps `updated_at` on its own writes, and
raw SQL `UPDATE`s (the status watcher) set `updated_at = now()` explicitly. Nothing
soft-deletes yet; raw reads that should honour `deleted_at` need their own
`deleted_at IS NULL`. Existing rows got `updated_at = created_at` from the migration, so the
column never claims a row changed when it did not.
