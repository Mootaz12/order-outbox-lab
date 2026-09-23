# Operations

Running, loading and inspecting the stack. The root README's
[Quick start](../README.md#quick-start), [Load generator](../README.md#load-generator) and
[Running locally without Docker](../README.md#running-locally-without-docker) sections have the
basics; this page collects what is useful once it is running.

## Running

```bash
docker compose up --build -d          # db, redis, migrator, app1..app3, nginx on :8080
docker compose ps                     # migrator should be "exited (0)", apps "healthy"
docker compose logs migrator          # "migrations applied: ..." or "already up to date"
docker compose down                   # add -v to drop the pgdata volume
```

Local dev against containers for the dependencies only:

```bash
docker compose up -d db redis migrator
pnpm start:dev                         # src/config/ defaults already point at localhost
```

Environment variables, all read in `src/config/`: `PORT` (default 3000, must be a positive
integer or boot fails), `INSTANCE_ID` (default `instance-local`), `DATABASE_URL`, `REDIS_URL`.
The load generator reads `TARGET_URL` (default `http://localhost:8080`, optionally from `.env`).

## Generating load

```bash
pnpm load burst 50 10      # batches of 10 concurrent POSTs: the pollers race for rows
pnpm load steady 20 1000   # one per second: easy to follow on the dashboard
pnpm load burst 1000 25    # needed to exercise the dead-letter path (0.15^3 for inventory)
```

See [tools/load-generator/README.md](../tools/load-generator/README.md).

## What /health checks

`GET /health` (Terminus, [src/modules/health/README.md](../src/modules/health/README.md)) runs
two checks, each with a 1.5s deadline:

| Key | Check |
| --- | --- |
| `postgres` | TypeORM `pingCheck` |
| `eventBus` | `EventBus.ping()`, a Redis `PING` raced against the deadline |

The event-bus check exists because a container cut off from Redis still serves requests and
writes rows while its SSE clients go silent. The deadline matters because the Redis publisher
connection queues commands while Redis is down (`maxRetriesPerRequest: null`), so an
un-deadlined PING would hang the probe instead of failing it.

The Compose healthcheck calls it with `wget` on `127.0.0.1:3000` every 5s (timeout 5s,
5 retries, 15s start period); nginx starts only once all three apps are healthy.

```bash
curl -s localhost:8080/health | jq
curl -si localhost:8080/health | grep -i x-served-by   # upstream IP:port, not INSTANCE_ID
```

## Watching the SKIP LOCKED race

Every relay tick logs how many rows it claimed:

```bash
docker compose logs -f app1 app2 app3 | grep 'poller tick'
# app2  | [instance-2] poller tick — locked 7 row(s)
# app1  | [instance-1] poller tick — locked 4 row(s)
# app3  | [instance-3] poller tick — locked 0 row(s)
```

The three pollers share the same 2s interval and started together, so their ticks are
phase-locked: with one-at-a-time traffic one instance wins nearly every race. Use a burst to
see the rows spread.

Other log lines worth grepping:

| Pattern | Meaning |
| --- | --- |
| `ok — order` | a stage attempt completed (logger context `PaymentService` etc.) |
| `failed — order` | a stage attempt failed; the suffix is `(retry)` or `(dead_letter)` |
| `already claimed — skipped` | duplicate delivery absorbed by the unique index (debug level) |
| `aborted:` | an unexpected error inside a stage; that attempt is lost |
| `status recompute failed` | the status watcher's `UPDATE` threw |
| `could not publish` | a live frame was dropped (Redis unavailable); Postgres is unaffected |

## Useful queries

```bash
docker compose exec db psql -U app -d orders
```

```sql
-- order status breakdown
SELECT status, count(*) FROM orders GROUP BY 1;

-- outbox backlog: claimable now vs waiting on retry backoff
SELECT count(*) FILTER (WHERE available_at <= now()) AS claimable,
       count(*) FILTER (WHERE available_at >  now()) AS backing_off
  FROM outbox WHERE processed = false;

-- stage events by stage and status
SELECT stage, status, count(*) FROM order_stage_events GROUP BY 1, 2 ORDER BY 1, 2;

-- no stage should ever complete twice for one order
SELECT order_id, stage, count(*) FROM order_stage_events
 WHERE status = 'completed' GROUP BY 1, 2 HAVING count(*) > 1;

-- dead letters, same as GET /dead-letters
SELECT order_id, stage, retry_count, last_error FROM stage_retries
 WHERE status = 'dead_lettered';

-- orders still pending well after creation (lost attempt, or a status bug)
SELECT id, created_at FROM orders
 WHERE status = 'pending' AND created_at < now() - interval '1 minute';

-- per-order timeline, as the dashboard hydrates it
SELECT stage, attempt, status, detail, created_at FROM order_stage_events
 WHERE order_id = '<uuid>' ORDER BY id;
```

An order that stays `pending` with a stage whose latest attempt has a `started` row but no
`completed`/`failed` row is a lost attempt: its outbox row was already marked processed when
the stage aborted or the instance died, so nothing re-runs it (see
[data-flow.md](data-flow.md#b-outbox-relay-tick)).
