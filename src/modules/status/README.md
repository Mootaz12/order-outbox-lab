# status

Owns the one decision no individual stage can make: whether an order as a whole is
`fulfilled` or `failed`. It is the only writer of `orders.status` after creation.

## Events in and out

- **in:** `StageEventsService.settled()` — every non-`started` frame, from any instance.
- **out:** two raw `UPDATE orders` statements per frame. No routes, no events emitted.

## Files

- `order-status.module.ts` — imports `StageEventsModule`, provides the service.
- `services/order-status.service.ts` — `OrderStatusService`: subscribe + `recompute()`.
- `tests/order-status.service.spec.ts` — fake `DataSource` + fake `settled()` Subject.

## The two guarded UPDATEs

```sql
-- 1. fulfilled: every stage has a completed row
UPDATE orders o SET status = $2 /* fulfilled */, updated_at = now()
 WHERE o.id = $1 AND o.status = $3 /* pending */
   AND (SELECT count(DISTINCT stage) FROM order_stage_events
         WHERE order_id = o.id AND status = $4 /* completed */) = $5 /* STAGE_COUNT */;

-- 2. failed: any stage is dead-lettered
UPDATE orders o SET status = $2 /* failed */, updated_at = now()
 WHERE o.id = $1 AND o.status = $3 /* pending */
   AND EXISTS (SELECT 1 FROM stage_retries sr
                WHERE sr.order_id = o.id AND sr.status = $4 /* dead_lettered */);
```

They run sequentially; if the first rejects, the second is skipped for that frame.

## Invariants and why

- **Derive from Postgres, never count in memory.** The three stages of one order may run on
  three different instances; only the database sees all of them.
- **`status = 'pending'` guard.** Makes duplicate and concurrent triggers (every instance gets
  every frame) harmless: the first winner moves the row, the rest match zero rows.
- **`updated_at = now()`** because raw SQL bypasses TypeORM's timestamp stamping.
- **Enum values are parameters**, not inlined literals.
- **Only `settled` frames** — a `started` row never changes status, and skipping it halves the
  queries under load.
- **Errors are logged, not thrown**: the subscription callback must not break the Rx stream.
- Correctness depends on `stages` publishing **after** commit; otherwise the dead-letter row
  would be invisible here and the order would stay `pending` forever.

## Talks to

- `stage-events` (reads `settled()`), Postgres via the injected `DataSource`.
