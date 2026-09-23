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

pnpm install
pnpm load burst 50 10                   # 50 orders, 10 at a time — see Load generator

# or a single order by hand:
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
is what makes interleaving and retries observable. Those numbers live in one table,
`STAGE_CONFIGS` in `src/modules/stages/stages.constants.ts`.

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

Nothing outside `src/infrastructure/event-bus/` knows it is Redis. Consumers inject the
abstract `EventBus` class (`publish` / `subscribe` / `ping`, payloads in and out as values),
and `EventBusModule` binds it to `RedisEventBus` in one `useClass` line — that is the only
thing to change for another driver. The one requirement a driver must meet is **broadcast**:
every subscriber on every instance gets every message. A work-queue style transport that
hands each message to one consumer would quietly bring back the two-thirds-silent problem.

## Schema

Migrations only — `synchronize` is off. Three instances inferring a schema at boot would
race each other to `CREATE TABLE` the same objects, so schema creation is a one-shot
`migrator` service the app containers gate on:

```mermaid
flowchart TD
    db[("db")] -->|service_healthy| migrator["migrator<br/>node dist/infrastructure/database/migrate.js"]
    db -->|service_healthy| app["app1 · app2 · app3"]
    redis[("redis")] -->|service_started| app
    migrator -->|service_completed_successfully| app
    app -->|all three report healthy| nginx["nginx"]
```

```yaml
migrator:
  command: ["node", "dist/infrastructure/database/migrate.js"]
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
`stage_retries`. See `src/infrastructure/database/migrations/` for the definitions.

## Code layout

```
src/
  main.ts  app.module.ts     composition root: infrastructure, then feature modules
  config/                    typed registerAs() namespaces: app, database, eventBus
  shared/                    pipeline.ts (the vocabulary)
  infrastructure/
    database/                TypeORM options, DatabaseModule, migrator entrypoint, migrations
    event-bus/               abstract EventBus + RedisEventBus driver (global)
  modules/
    orders/                  POST/GET /orders, GET /dead-letters, input parsing
    outbox/                  Outbox entity, enqueueOutbox(), the SKIP LOCKED relay
    stages/                  StageRunner, STAGE_CONFIGS, the stage handler factory, retry policy
    stage-events/            audit-log entity, event-bus fan-out, GET /orders/:id/stages and /stream
    status/                  recomputes orders.status from Postgres
    health/                  Terminus: Postgres + event bus
public/js/                   the dashboard, plain ES modules, no bundler
tools/load-generator/        HTTP-only traffic generator (pnpm load)
```

Each feature folder owns its entity, and keeps its constants in `<feature>.constants.ts` and
its types (interfaces, enums, SQL row shapes) in `<feature>.types.ts` — services, controllers
and entities import them rather than declaring them. Entities are discovered by the `*.entity.ts` glob in
`src/infrastructure/database/database-options.ts`, which both the app and the migrator use — a
new entity needs the file suffix and a migration, nothing registered by hand.

```mermaid
flowchart TD
    orders["modules/orders"] -->|"enqueueOutbox() in the order's transaction"| outbox["modules/outbox"]
    outbox -->|"emit order.created or &lt;stage&gt;.retry"| stages["modules/stages"]
    stages -->|"enqueueOutbox() for a retry"| outbox
    stages -->|"record() → order_stage_events"| events["modules/stage-events"]
    stages -->|"publish after commit"| events
    events -->|"EventBus stage_events → SSE"| dash["public/js"]
    events -->|"settled frames"| status["modules/status"]
    status -->|"recompute from Postgres"| db[("Postgres")]
```

A few rules hold this together:

- **No string literals for anything the pipeline keys on.** Stage names, statuses, event
  names and the event-bus channel are enums in `src/shared/pipeline.ts`, and `stageEvent()` is
  the only place the `payment.retry` shape is assembled. `@OnEvent` decorators take those
  enum values directly, so a rename is a compile error rather than a silently
  unsubscribed stage. The same enums are bound as SQL parameters instead of being typed
  into the queries.
- **Every environment read lives in a `registerAs()` factory in `src/config/`.** Consumers
  inject a namespace with `@Inject(appConfig.KEY) app: AppConfig` (`AppConfig` is
  `ConfigType<typeof appConfig>`), so config is typed at the point of use and a malformed value
  like `PORT=abc` fails at boot. Code outside Nest's DI — the migrator — calls the factory
  directly: `databaseConfig()`.
- **One writer per table that matters.** `enqueueOutbox()` is the only insert into `outbox`
  and always runs on the caller's transaction manager, so an outbox row commits with the change
  that caused it. `StageRunner.record()` is the only write into the audit log — claim, complete
  and fail all go through it, so the `ON CONFLICT DO NOTHING` idempotency rule exists in exactly
  one place.
- **One frame shape.** `StageEventFrame` (`modules/stage-events/stage-events.types.ts`) is both
  the event-bus payload and the SSE `data`.

**Adding a stage** is an entry in `StageName` and `STAGES` (`src/shared/pipeline.ts`) plus a
row in `STAGE_CONFIGS`. `stageHandler()` in `stage-handler.ts` builds a distinct provider class
per stage — it has to be a distinct class because `@OnEvent` metadata lives on the prototype
and each stage's retry event differs. Everything else (claim, retry, dead-letter, publish) is
shared in `stage-runner.ts`.

On the dashboard side, `public/js/` is split into `format.js` (day.js timestamps, always in
UTC), `dom.js` (node construction), `api.js` (fetch that rejects on non-2xx), `sidebar.js`
(order list and dead letters), `timeline.js` (stage table rows) and `app.js` (selection:
hydrate over REST, then subscribe over SSE). `dom.js` deliberately has no HTML-accepting path:
`customerName` and stage `detail` are caller-supplied strings, and rendering them with
`innerHTML` would let a name like `<img src=x onerror=...>` execute inside the dashboard.

## API

| | |
| --- | --- |
| `POST /orders` | `{ customerName, amount }` → `201 { id }`, returns before any processing |
| `GET /orders?limit=50` | recent orders with status |
| `GET /orders/:id/stages` | current stage rows from Postgres, for hydrating before subscribing |
| `GET /orders/:id/stream` | SSE, `stage` events as they happen |
| `GET /dead-letters` | `(order, stage)` pairs that exhausted their retries |
| `GET /health` | Terminus check that pings Postgres **and** the event bus (`eventBus` key) |

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

## Load generator

`tools/load-generator` sends traffic at a running stack over HTTP only: it calls
`POST /orders` and imports nothing from `src/`. It targets `TARGET_URL` (default
`http://localhost:8080`, can be set in `.env`).

```bash
pnpm load burst 50 10      # 50 orders, 10 concurrent — makes the pollers race for rows
pnpm load steady 20 1000   # one order per second — easy to follow on the dashboard
```

Details: [tools/load-generator/README.md](tools/load-generator/README.md).

## Testing

`pnpm test` covers the pure pieces: the retry policy, the stage config table and the event
vocabulary. Everything that depends on real Postgres behaviour — `SKIP LOCKED`, the unique-index
claim, the status watcher — is only meaningful against the running stack. Two things only show
up at volume and are worth knowing before you read the logs:

- **`SKIP LOCKED` racing needs a burst.** Each poller runs on the same `@Interval(2000)` and
  they all started at boot, so the ticks are phase-locked. For one-at-a-time traffic instance-1
  wins essentially every race; under a burst the lock contention is visible.
- **The dead-letter path is the one branch a small run never reaches.** Three consecutive
  failures on one stage is 0.15³ for inventory, so a 40-order run produces zero dead letters and
  looks healthy. That is how the publish-before-commit bug below survived the first pass. Use
  `pnpm load burst 1000 25` when touching retry or status logic.

## Running locally without Docker

```bash
docker compose up -d db redis migrator
export DATABASE_URL=postgres://app:app@localhost:5432/orders REDIS_URL=redis://localhost:6379
pnpm install && pnpm build && pnpm start:dev
```

`pnpm build` runs `pnpm run vendor` first, which copies `dayjs.min.js` plus the `utc` and
`localizedFormat` plugins into `public/vendor/`. That directory is generated and gitignored;
the dashboard loads them as plain scripts because the page has no bundler.

The plugins are not optional decoration. `LTS` is a *locale* token, and dayjs core only
resolves it once `localizedFormat` is loaded — without that plugin `format('LTS')` silently
returns the literal string `"LTS"` and every timestamp column fills in with the word "LTS".
`utc` is there because `order_stage_events.created_at` is `timestamptz`, so rendering it in
the browser's own zone would shift the dashboard away from what `psql` prints;
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
  reports the event bus, so a silent stream is no longer invisible.
- Failure is random by rate, not by dependency, so an order can fail payment and succeed on
  retry. There is no compensation step: stages emit only their own `retry` event, and real
  compensation would need `completed` / `failed` events for something to consume.
