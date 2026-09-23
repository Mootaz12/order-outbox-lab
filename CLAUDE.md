# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

A NestJS 11 + TypeORM learning project: transactional outbox on Postgres with `FOR UPDATE SKIP LOCKED`, three competing-consumer app instances behind Nginx, and Redis pub/sub fanning stage events out to SSE clients. `README.md` is long and accurate — read it for the reasoning behind each design choice.

## Commands

```bash
pnpm build                 # runs `pnpm run vendor` first (copies dayjs + plugins into public/vendor/, gitignored)
pnpm start:dev             # watch mode; needs Postgres + Redis + applied migrations (see below)
pnpm test                  # jest: every src/**/*.spec.ts — src/modules/<feature>/tests/ plus src/config/parse.spec.ts
pnpm jest src/modules/stages                        # one feature
pnpm jest src/modules/stages/tests/retry-policy.helper.spec.ts   # single file
pnpm jest -t 'name of test'                         # single test by name
pnpm load burst 50 10      # tools/load-generator: POST /orders at TARGET_URL (default :8080)
pnpm load steady 20 1000
```

There is no linter or formatter configured.

Full stack (3 apps + nginx on :8080 + db + redis + one-shot migrator):

```bash
docker compose up --build -d
docker compose down        # add -v to drop the pgdata volume
docker compose exec db psql -U app -d orders
```

Local dev without the app containers: `docker compose up -d db redis migrator`, then `pnpm start:dev`. The `src/config/` defaults already point at localhost, so no env vars are needed.

There is no end-to-end test script; Postgres-dependent behaviour is checked against the running stack. Small runs rarely exercise the dead-letter path (0.15³ for inventory), so use `pnpm load burst 1000 25` when changing retry/status logic, then query `order_stage_events` / `stage_retries` via `docker compose exec db psql -U app -d orders`.

Layout: `src/config/` (typed `registerAs` namespaces), `src/shared/` (pipeline vocabulary), `src/infrastructure/` (database options + migrator + migrations, event bus), `src/modules/<feature>/` (see Conventions for the per-feature folder layout), `public/js/` (dashboard), `tools/load-generator/` (excluded from the Nest build and the Docker image).

## Documentation

`docs/` (architecture, data flow with mermaid diagrams, operations) and each `src/modules/<feature>/README.md` go deeper than this file. When a change alters a flow, update the matching diagram in `docs/data-flow.md` and the feature README. Every function/method carries a JSDoc of at most 2 lines; longer reasoning belongs in the feature README or `docs/`, not in the comment.

## Architecture

Every instance runs the same roles; there is no leader. Flow:

1. `OrdersService` inserts the `orders` row and an untagged `outbox` row in one transaction, returns 201. Outbox rows are only ever written through `enqueueOutbox()` (`src/modules/outbox/helpers/enqueue-outbox.helper.ts`) on the caller's transaction manager.
2. `OutboxRelayService` (`@Interval(2000)` on every instance) claims up to 50 rows with `SKIP LOCKED`, emits in-process events **without awaiting them** (awaiting would hold row locks for the whole stage), then marks rows processed in the same transaction. Untagged row → `order.created` (all three stages); row with `stage` set → `<stage>.retry` (only that stage).
3. Stages are not hand-written classes: `stageHandler()` (`src/modules/stages/services/stage-handler.factory.ts`) builds one `StageRunner` subclass per row of `STAGE_CONFIGS` (`consts/stages.constants.ts`), each with `@OnEvent(OrderEvent.Created)` and its own `<stage>.retry`. It must stay one distinct class per stage (decorator metadata is per-prototype); class names are set to `PaymentService` etc. because they're the logger context. Adding a stage = `StageName` + `STAGES` in `src/shared/pipeline.ts` + a `STAGE_CONFIGS` row. All logic lives in `src/modules/stages/services/stage-runner.service.ts`:
   - The claim is inserting the `started` row into `order_stage_events` (unique on `order_id, stage, attempt, status`, `ON CONFLICT DO NOTHING`). No row inserted → duplicate delivery → skip. `record()` is the single write path into that table.
   - Failure: one transaction writes the `failed` row, upserts `stage_retries`, and either enqueues (via `enqueueOutbox()`) a new stage-tagged outbox row with future `available_at` (backoff from `helpers/retry-policy.helper.ts`) or marks it `dead_lettered` at the cap.
   - Event-bus publish happens **after** the commit, for failures too — the status watcher reads `stage_retries`, so publishing inside the transaction left orders stuck `pending`.
   - `run()` must never reject: eventemitter2 discards handler promises, and an unhandled rejection kills the Node 20 process.
4. `StageEventsService` publishes a `StageEventFrame` (same shape on the bus and in SSE) to the `EventBus` channel `stage_events`; every instance subscribes (including to its own messages) and feeds its local SSE clients (`GET /orders/:id/stream`). This is the only cross-instance channel. `EventBus` (`src/infrastructure/event-bus/event-bus.ts`) is an abstract class used as the DI token; `EventBusModule` binds it to `RedisEventBus` with one `useClass`. Nothing else may import ioredis. Any replacement driver must broadcast to every subscriber on every instance (not load-balance), or SSE clients on other instances go silent.
5. `OrderStatusService` subscribes to settled frames and recomputes `orders.status` from Postgres, always guarded by `WHERE status = 'pending'`, so duplicate triggers and multi-instance processing are harmless.

Delivery is at-least-once by design; idempotency comes from the unique index, not from the relay.

## Conventions

- **No string literals for pipeline keys.** Stage names, statuses, event names and the event-bus channel (`EventChannel`) are enums in `src/shared/pipeline.ts`; build stage event names only via `stageEvent()`. Pass enum values as SQL parameters rather than inlining them in queries.
- **All `process.env` reads live in `registerAs()` factories in `src/config/`.** Inject with `@Inject(appConfig.KEY) app: AppConfig` (types are `ConfigType<typeof x>`); outside DI (the migrator) call the factory directly, e.g. `databaseConfig()`. Add new namespaces to `configNamespaces` in `src/config/index.ts`.
- **Every feature uses the same folder layout:** `<feature>.module.ts` at the root, a `README.md` (purpose, routes/events, file map, invariants — keep it current when behaviour changes), then only the subfolders it needs — `controllers/`, `services/` (all injectables, incl. health indicators and the stage handler factory), `helpers/` (pure functions), `entities/`, `types/`, `consts/`, `tests/` (`*.spec.ts` for that feature). File suffixes match the folder: `.controller.ts`, `.service.ts`/`.indicator.ts`/`.factory.ts`, `.helper.ts`, `.entity.ts`, `.types.ts`, `.constants.ts`. Don't put a new file at the feature root. Tests construct classes directly with small hand-written in-memory fakes of our own collaborators (fake `EventBus` subclass, fake `DataSource`/manager, fake repositories) — no real DB/Redis, no mocking libraries.
- **Constants and types live in their own files per feature:** `consts/<feature>.constants.ts` (tunables like `OUTBOX_BATCH_SIZE`, `MAX_RETRIES`, `STAGE_CONFIGS`) and `types/<feature>.types.ts` (interfaces, enums like `RetryDecision`, raw SQL row types like `RetryCounterRow`). Don't declare `const`/`interface`/`type`/`enum` or inline object types in services, controllers or entities; only create the file when the feature has something to put in it. Pipeline-wide vocabulary stays in `src/shared/pipeline.ts`.
- **`src/base/` holds every base others extend** — base entities, base DTOs, base interfaces/types — imported via `@base/*`. Don't put a new base class inside a feature.
- **Import across folders with path aliases:** `@base/*`, `@config`, `@shared/*`, `@infrastructure/*`, `@modules/*` (defined in `tsconfig.json` `paths`, mirrored in the `jest.moduleNameMapper` in `package.json`). Keep `./x` for files in the same folder; anything else — including a sibling subfolder of the same feature — uses the alias (`@modules/orders/services/orders.service`); never `../`. `nest build` rewrites aliases to relative paths in `dist/`, so the runtime needs no resolver — if you ever build with plain `tsc`, that stops being true.
- **Entity classes are suffixed `Entity`** (`OrderEntity`, `OutboxEntity`, `OrderStageEventEntity`, `StageRetryEntity`); files stay `<name>.entity.ts`. uuid-keyed entities extend our `BaseEntity` (`src/base/base-entity.ts`: uuid `id`, `created_at`, `updated_at`, soft-delete `deleted_at`) instead of redeclaring them; any raw SQL `UPDATE` on those tables must set `updated_at = now()` (TypeORM only stamps its own writes), and raw reads that should skip soft-deleted rows need `deleted_at IS NULL`; `order_stage_events` (bigserial id) and `stage_retries` (composite key) don't. Import `BaseEntity` from `@base/base-entity`, never from `typeorm` (TypeORM's same-named active-record class would compile without these columns). The file must not be named `*.entity.ts` (entity glob). Validate route params with Nest's built-in pipes (e.g. `ParseUUIDPipe`) rather than hand-written regexes. There are no DTO classes: `POST /orders` is parsed by hand in `helpers/parse-create-order.helper.ts` into interfaces in `types/orders.types.ts`.
- **Schema changes are migrations only** (`synchronize: false` everywhere) in `src/infrastructure/database/migrations/`. The `migrator` compose service (`dist/infrastructure/database/migrate.js`) applies them before apps start. Entities are discovered by the `*.entity.ts` glob in `src/infrastructure/database/database-options.ts`, shared by the app and the migrator — don't switch to `autoLoadEntities`, since `OutboxEntity` is used only via `manager.insert` and is in no `forFeature`.
- Dashboard (`public/js/`, no bundler, ES modules loaded from `app.js`; `sidebar.js` and `timeline.js` take callbacks to avoid import cycles): `dom.js` has no HTML-accepting path on purpose, since `customerName` and stage `detail` are user-controlled. Never use `innerHTML`. Timestamps are rendered in UTC via `format.js`, and `format('LTS')` needs the `localizedFormat` plugin loaded.
- Stage handlers are fire-and-forget, so errors are caught and logged in `StageRunner.run`. Don't add awaits in the relay loop to "fix" that.
