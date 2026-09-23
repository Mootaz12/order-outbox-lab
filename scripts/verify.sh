#!/usr/bin/env bash
# End-to-end assertions against the running stack. Run after driving some load:
#   docker compose up --build -d
#   (cd ../order-load-generator && npm start -- burst 40 10)
#   ./scripts/verify.sh
set -uo pipefail
cd "$(dirname "$0")/.."

# Mirrors src/stages/retry-policy.ts and the STAGES list in src/common/pipeline.ts.
# SQL cannot import them, so change them here too when either moves.
MAX_RETRIES=3
STAGE_COUNT=3

q() { docker compose exec -T db psql -U app -d orders -tAc "$1"; }

failures=0
check() { # label, sql, expected
  local actual
  actual=$(q "$2")
  if [[ "$actual" == "$3" ]]; then
    printf '  ok    %s\n' "$1"
  else
    printf '  FAIL  %s (expected %s, got %s)\n' "$1" "$3" "$actual"
    failures=$((failures + 1))
  fi
}

echo "waiting for the outbox to drain"
for _ in $(seq 1 60); do
  [[ "$(q 'SELECT count(*) FROM outbox WHERE processed = false AND available_at <= now()')" == "0" ]] && break
  sleep 2
done
# Stages run for up to two seconds; give anything mid-flight a chance to land.
sleep 6

echo
echo "invariants"
# At-least-once delivery must not let a stage run the same attempt twice.
check "no duplicated (order, stage, attempt, status)" \
  "SELECT count(*) FROM (SELECT order_id, stage, attempt, status FROM order_stage_events GROUP BY 1,2,3,4 HAVING count(*) > 1) d" 0
# The retry counter must actually cap work, not just describe it.
check "no attempt beyond MAX_RETRIES" \
  "SELECT count(*) FROM order_stage_events WHERE attempt > $MAX_RETRIES" 0
check "dead letters all hit the retry limit exactly" \
  "SELECT count(*) FROM stage_retries WHERE status = 'dead_lettered' AND retry_count <> $MAX_RETRIES" 0
# Fan-out integrity: one order.created event must reach all three subscribers.
check "every order reached all three stages" \
  "SELECT count(*) FROM orders o WHERE (SELECT count(DISTINCT stage) FROM order_stage_events WHERE order_id = o.id AND status = 'started') <> $STAGE_COUNT" 0
# The status watcher's two rules must not contradict each other.
check "no fulfilled order has a dead-lettered stage" \
  "SELECT count(*) FROM orders o JOIN stage_retries r ON r.order_id = o.id AND r.status = 'dead_lettered' WHERE o.status = 'fulfilled'" 0
check "no failed order has three completed stages" \
  "SELECT count(*) FROM orders o WHERE o.status = 'failed' AND (SELECT count(DISTINCT stage) FROM order_stage_events WHERE order_id = o.id AND status = 'completed') = $STAGE_COUNT" 0
# Everything must terminate: pending means the pipeline left a row on the floor.
check "no order left pending after drain" \
  "SELECT count(*) FROM orders WHERE status = 'pending'" 0

echo
echo "data"
q "SELECT 'orders: ' || count(*) FROM orders"
q "SELECT '  fulfilled: ' || count(*) FROM orders WHERE status = 'fulfilled'"
q "SELECT '  failed:    ' || count(*) FROM orders WHERE status = 'failed'"
q "SELECT 'stage events: ' || count(*) FROM order_stage_events"
q "SELECT 'retries pending: ' || count(*) FROM stage_retries WHERE status = 'pending'"
q "SELECT 'dead letters: ' || count(*) FROM stage_retries WHERE status = 'dead_lettered'"

echo
if [[ $failures -eq 0 ]]; then
  echo "all invariants hold"
else
  echo "$failures check(s) failed"
  exit 1
fi
