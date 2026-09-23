# order-outbox-lab

Transactional outbox with Postgres `SKIP LOCKED`, competing-consumer stage workers, and
live SSE fan-out. A learning project, so it runs the real thing: three app containers
behind Nginx, a real Postgres, a real Redis, real health checks — no mocked timers
standing in for any of it.

```mermaid
flowchart LR
    curl["POST /orders"] --> nginx
    browser["dashboard<br/>EventSource"] --> nginx

    nginx["nginx<br/>round-robin<br/>adds X-Served-By"]

    subgraph apps["three identical instances"]
        direction TB
        app1["app1 · instance-1"]
        app2["app2 · instance-2"]
        app3["app3 · instance-3"]
    end

    pg[("Postgres<br/>orders · outbox<br/>order_stage_events<br/>stage_retries")]
    redis[("Redis<br/>channel stage_events")]

    nginx --> app1
    nginx --> app2
    nginx --> app3
    app1 -->|writes| pg
    app2 -->|writes| pg
    app3 -->|writes| pg
    app1 -.->|publish| redis
    app2 -.->|publish| redis
    app3 -.->|publish| redis
    redis -.->|subscribe| app1
    redis -.->|subscribe| app2
    redis -.->|subscribe| app3
```

Each instance carries the same four roles: the `POST /orders` handler, the outbox poller,
the three stage modules, and the SSE server. The dotted lines are the only thing that makes
a browser on `app1` see work done by `app2`.

## Quick start

```bash
docker compose up --build -d
curl -s localhost:8080/health | jq    # status ok, with postgres and redis both up

# Generate traffic from the sibling repo, or:
curl -s -X POST localhost:8080/orders -H 'content-type: application/json' \
  -d '{"customerName":"customer-1","amount":"42.50"}'
```

Open <http://localhost:8080/> for the dashboard: recent orders on the left, click one to
hydrate its stage timeline from `order_stage_events` and then watch it update over SSE.

Tear down with `docker compose down`, or `docker compose down -v` to drop the data too.

## Order lifecycle

```mermaid
sequenceDiagram
    autonumber
    participant C as client
    participant N as nginx
    participant A as app1 / instance-1
    participant P as Postgres
    participant R as Redis
    participant B as browser on app3

    C->>N: POST /orders
    N->>A: round-robin picks instance-1
    A->>P: BEGIN — INSERT orders, INSERT outbox — COMMIT
    A-->>N: 201 with the new id
    N-->>C: 201 with the new id
    Note over A,P: nothing downstream has happened yet — the request is over

    Note over A: poller tick, every 2s, on all three instances
    A->>P: SELECT ... FOR UPDATE SKIP LOCKED
    P-->>A: only the rows app2 and app3 are not holding
    A->>A: emit order.created in-process
    A->>P: INSERT order_stage_events started ON CONFLICT DO NOTHING
    A->>R: PUBLISH stage_events
    R-->>B: SSE frame — app3 serves the browser, app1 did the work
    Note over A: simulated work, 400 to 2000ms per stage
    A->>P: INSERT order_stage_events completed
    A->>R: PUBLISH stage_events
    A->>P: UPDATE outbox SET processed = true
    B->>P: status watcher recomputes orders.status
```

Two things to read off this: step 4 commits the order and its event together, and steps
7–9 cross an instance boundary that an in-process emitter alone could not.

## What each piece is for

**The outbox.** `POST /orders` inserts the order *and* an `outbox` row in one transaction,
then returns `201` immediately. Nothing downstream has happened yet. Writing the event in
the same transaction as the state change is the point: the event exists if and only if the
order does, which is what a "fire an event after the commit" approach cannot promise when
the process dies between the two.

**Competing consumers.** Every instance runs the same poller every 2s:

```sql
SELECT * FROM outbox
 WHERE processed = false AND available_at <= now()
 ORDER BY created_at, id
 LIMIT 50
 FOR UPDATE SKIP LOCKED
```

`SKIP LOCKED` is what lets all three poll one table without double-delivering. A row one
instance has locked is skipped rather than waited on, so the others move straight to the
next rows. Watch it resolve differently on every burst:

```bash
docker compose logs -f app1 app2 app3 | grep 'poller tick'
# app2  | [instance-2] poller tick — locked 7 row(s)
# app1  | [instance-1] poller tick — locked 4 row(s)
# app3  | [instance-3] poller tick — locked 0 row(s)
```

**Stage fan-out.** The instance that claims a row emits `order.created` in-process, so
payment, inventory and email run there. That's deliberate: work spreads across instances
without each one doing the whole job. Stages have randomized delays (payment 700–1500ms,
inventory 900–2000ms, email 400–1000ms) and different failure rates (10%, 15%, 5%), which
is what makes interleaving and retries observable.

**Durable retries.** A failing stage does three things in one transaction: appends its
`failed` row, upserts `stage_retries`, and enqueues a *new outbox row tagged with its own
stage* plus an `available_at` in the future. So:

- only the failed stage re-runs — a `payment` retry emits `payment.retry`, which nothing
  else subscribes to;
- backoff lives in the database rather than in a `setTimeout`, so restarting an instance
  mid-backoff costs nothing;
- the retry path goes through the same `SKIP LOCKED` race, and can be claimed by a
  different instance than the one that failed.

```mermaid
flowchart TD
    start(["stage delivery arrives"]) --> claim{"INSERT started row<br/>collides on the unique index?"}
    claim -->|yes| skip["duplicate delivery — return,<br/>run nothing"]
    claim -->|no| work["simulate work<br/>randomised delay"]
    work --> roll{"failure roll below<br/>failureRate?"}
    roll -->|no| ok["INSERT completed row"]
    ok --> pub_ok["publish the frame, then<br/>mark the outbox row processed"]
    roll -->|yes| txn["one transaction"]
    txn --> t1["INSERT failed row"]
    t1 --> t2["UPSERT stage_retries<br/>retry_count = retry_count + 1<br/>RETURNING retry_count"]
    t2 --> dec{"retry_count at the cap?"}
    dec -->|no| q["INSERT outbox row<br/>stage = this stage<br/>available_at = now + attempt × 1s"]
    dec -->|yes| dl["UPDATE stage_retries<br/>status = dead_lettered"]
    q --> commit(["COMMIT"])
    dl --> commit
    commit --> pub_fail["publish the failed frame<br/>after the commit"]
    pub_fail --> back["the retry re-enters the<br/>SKIP LOCKED race,<br/>possibly on another instance"]
```

At 3 recorded failures a `(order, stage)` pair becomes `dead_lettered` and stops
enqueueing, so a permanently broken stage can't loop forever.

**Idempotency.** `order_stage_events` is unique on `(order_id, stage, attempt, status)`. A
stage claims an attempt by inserting its `started` row; a duplicate delivery of the same
attempt collides on that insert and returns without running. `status` is part of the key so
that the `started` and `completed` rows for one attempt can coexist while a re-delivered
`started` still collides.

**Status.** No individual stage knows whether the order is done, so a watcher module owns
that. It recomputes from Postgres rather than counting events in memory:

```sql
UPDATE orders o SET status = 'fulfilled'
 WHERE o.id = $1 AND o.status = 'pending'
   AND (SELECT count(DISTINCT stage) FROM order_stage_events
         WHERE order_id = o.id AND status = 'completed') = 3;
```

Reading the database makes it correct when an order's three stages were processed by three
different instances, and the `status = 'pending'` guard makes duplicate triggers harmless.

```mermaid
stateDiagram-v2
    [*] --> pending: POST /orders committed
    pending --> fulfilled: three distinct stages completed
    pending --> failed: any stage dead_lettered
    fulfilled --> [*]
    failed --> [*]
    note right of pending
        Only OrderStatusService writes these,
        always with WHERE status = 'pending',
        so a repeat trigger changes nothing.
        No path leads back out of a terminal state.
    end note
```

The watcher subscribes to *settled* frames only — a `started` row can never change an
order's status, and skipping it halves the queries this module issues under load.

## Why Redis

`@nestjs/event-emitter` is in-process. With three instances behind a round-robin proxy, a
browser's `EventSource` lands on whichever instance happens to take it, while the outbox row
it wants to watch may have been claimed by another one — so roughly two-thirds of orders
would show nothing on the stream. Redis pub/sub is the cross-instance bus: every stage-event
insert is published to the `stage_events` channel, and every instance subscribes and feeds
its own local SSE clients from that (including messages it published itself, so there is one
code path rather than two).

Postgres `LISTEN`/`NOTIFY` would do this without a fourth service. Redis was chosen because
it's the general answer for cross-process fan-out and stays useful if this grows shared
rate limits, locks or a stream consumer.

## Schema

Migrations only — `synchronize` is off. Three instances inferring a schema at boot would
race each other to `CREATE TABLE` the same objects, so schema creation is a one-shot
`migrator` service the app containers gate on:

```mermaid
flowchart TD
    db[("db")] -->|service_healthy| migrator["migrator<br/>node dist/database/migrate.js"]
    db -->|service_healthy| app["app1 · app2 · app3"]
    redis[("redis")] -->|service_started| app
    migrator -->|service_completed_successfully| app
    app -->|all three report healthy| nginx["nginx"]
```

```yaml
migrator:
  command: ["node", "dist/database/migrate.js"]
  depends_on:
    db: { condition: service_healthy }
  restart: "no"
# app1..app3
  depends_on:
    migrator: { condition: service_completed_successfully }
```

`db: condition: service_healthy` means an app container won't start until `pg_isready`
actually passes, not merely until the container exists.

Four tables: `orders`, `outbox`, `order_stage_events` (append-only, the read model), and
`stage_retries`. See `src/database/migrations/` for the definitions.

## Code layout

```mermaid
flowchart TD
    pipeline["src/common/pipeline.ts<br/>StageName · StageStatus · OrderStatus<br/>StageRetryStatus · OrderEvent<br/>RedisChannel · stageEvent() · STAGES"]
    env["src/common/env.ts<br/>every process.env read, with defaults"]

    pipeline --> entities["src/entities"]
    pipeline --> orders["src/orders"]
    pipeline --> outbox["src/outbox"]
    pipeline --> stages["src/stages"]
    pipeline --> status["src/status"]
    pipeline --> events["src/order-events"]
    env --> outbox
    env --> stages
    env --> events
    env --> entities

    orders -->|"insert order + outbox row"| outbox
    outbox -->|"emit order.created or stage.retry"| stages
    stages -->|"append-only rows"| entities
    stages -->|publish| events
    events -->|SSE| dash["public/js"]
    status -->|recompute| entities
```

Two rules hold this together:

- **No string literals for anything the pipeline keys on.** Stage names, statuses, event
  names and the Redis channel are enums in `src/common/pipeline.ts`, and `stageEvent()` is
  the only place the `payment.retry` shape is assembled. `@OnEvent` decorators take those
  enum values directly, so a rename is a compile error rather than a silently
  unsubscribed stage. The same enums are bound as SQL parameters instead of being typed
  into the queries.
- **Every environment read goes through `src/common/env.ts`.**

`StageRunner.record()` is the single write into the audit log — claim, complete and fail all
go through it, so the `ON CONFLICT DO NOTHING` idempotency rule exists in exactly one place.

On the dashboard side, `public/js/` is split into `format.js` (day.js timestamps, always in
UTC), `dom.js` (node construction) and `api.js` (fetch that rejects on non-2xx). `dom.js`
deliberately has no HTML-accepting path: `customerName` and stage `detail` are
caller-supplied strings, and rendering them with `innerHTML` would let a name like
`<img src=x onerror=...>` execute inside the dashboard.

## API

| | |
| --- | --- |
| `POST /orders` | `{ customerName, amount }` → `201 { id }`, returns before any processing |
| `GET /orders?limit=50` | recent orders with status |
| `GET /orders/:id/stages` | current stage rows from Postgres, for hydrating before subscribing |
| `GET /orders/:id/stream` | SSE, `stage` events as they happen |
| `GET /dead-letters` | `(order, stage)` pairs that exhausted their retries |
| `GET /health` | Terminus check that pings Postgres **and** Redis |

Nginx adds `X-Served-By`, so you can see which instance answered:

```bash
curl -si localhost:8080/health | grep -i x-served-by
```

## Seeing the data directly

```bash
docker compose exec db psql -U app -d orders
```

```sql
SELECT stage, status, count(*) FROM order_stage_events GROUP BY 1,2 ORDER BY 1,2;

-- which attempt actually succeeded, per order and stage
SELECT order_id, stage, max(attempt) AS attempts,
       bool_or(status = 'completed') AS ok
  FROM order_stage_events GROUP BY 1,2 ORDER BY attempts DESC LIMIT 10;
```

## Verification

`npm test` covers the pure retry policy and the event vocabulary. Everything that depends on
real Postgres behaviour is checked against the running stack instead of mocked:

```bash
./scripts/verify.sh
```

It asserts no stage ran the same attempt twice, nothing exceeded the retry cap, every order
reached all three stages, `fulfilled` and `dead_lettered` never contradict each other, no
order is left `pending` after the outbox drains, and dead-letters only ever appear at
exactly the retry limit.

The last run against this stack was 5,653 orders / 37,636 stage events / 22 dead letters, and
all seven held. Two things only showed up at that volume and are worth knowing before you read
the logs:

- **`SKIP LOCKED` racing needs a burst.** Each poller runs on the same `@Interval(2000)` and
  they all started at boot, so the ticks are phase-locked. For one-at-a-time traffic instance-1
  wins essentially every race; under a burst the lock contention is visible, and one tick there
  claimed 40 rows on one instance while the others picked up the rest.
- **The dead-letter path is the one branch a small run never reaches.** Three consecutive
  failures on one stage is 0.15³ for inventory, so a 40-order run produced zero dead letters and
  looked healthy. That is how the publish-before-commit bug below survived the first pass.

## Running locally without Docker

```bash
docker compose up -d db redis migrator
export DATABASE_URL=postgres://app:app@localhost:5432/orders REDIS_URL=redis://localhost:6379
npm install && npm run build && npm run start:dev
```

`npm run build` runs `npm run vendor` first, which copies `dayjs.min.js` plus the `utc` and
`localizedFormat` plugins into `public/vendor/`. That directory is generated and gitignored;
the dashboard loads them as plain scripts because the page has no bundler.

The plugins are not optional decoration. `LTS` is a *locale* token, and dayjs core only
resolves it once `localizedFormat` is loaded — without that plugin `format('LTS')` silently
returns the literal string `"LTS"` and every timestamp column fills in with the word "LTS".
`utc` is there because `order_stage_events.created_at` is `timestamptz`, so rendering it in
the browser's own zone would shift the dashboard away from what `psql` and `verify.sh` print;
`format.js` pins UTC and the column header says so.

## Known limits

These are the honest edges of a first pass, not hidden bugs:

- **Delivery is at-least-once.** Events are emitted before the transaction that marks them
  processed commits, so a failed commit replays them. The unique-index claim makes that
  harmless for stages; it's still worth knowing.
- **A crash mid-stage loses in-flight work.** If an instance dies after claiming a row but
  before its stage finishes, that order sits until something re-enqueues it. The usual fix is
  a visibility timeout — stamp `locked_at`, and let the poller also reclaim rows whose lock
  has gone stale. Not implemented here.
- **Stage handlers must never reject, and `StageRunner.run` is total to enforce that.** The
  relay fires events without awaiting them, because awaiting would hold the `SKIP LOCKED` row
  locks for the whole simulated stage. eventemitter2's synchronous `emit` discards the promise
  a handler returns, so a rejection surfaces as an unhandledRejection — and Node 20 answers
  those by exiting, killing an instance whose healthcheck was green. The cost of the trade is
  that an unexpected error logs at `error` level and loses that attempt.
- **SSE publication happens after the commit**, for failures as well as successes. That is not
  cosmetic: the status watcher decides whether an order is dead by reading `stage_retries`, so
  a subscriber woken *inside* the transaction cannot see the `dead_lettered` row yet — and
  since a dead letter is the last event that order will ever emit, nothing comes back to
  correct it. Running 1000 orders left 3 orders stuck `pending` with a dead letter each;
  publishing after the commit is what closed it. A Redis outage still only costs a dashboard
  frame, because Postgres keeps the truth and a reload re-hydrates it — but `/health` now
  reports Redis, so a silent stream is no longer invisible.
- Failure is random by rate, not by dependency, so an order can fail payment and succeed on
  retry. Real compensation would use the `payment.completed` / `payment.failed` events that
  stages also emit — nothing consumes them yet.
