/**
 * Load generator for a running stack. It talks to POST /orders over HTTP and nothing else:
 * no imports from src/, no shared code, so it works against any deployment of the API.
 */

const TARGET_URL = process.env.TARGET_URL ?? 'http://localhost:8080';

/** The two shapes of traffic, named once so usage and dispatch cannot drift apart. */
enum LoadMode {
  Burst = 'burst',
  Steady = 'steady',
}

const USAGE = `usage: pnpm load [${LoadMode.Burst} <count> <concurrency>] | [${LoadMode.Steady} <count> <intervalMs>]`;

const stats = { created: 0, rejected: 0 };

/** A POST /orders body with a random customer name and a two-decimal amount. */
function randomOrder() {
  return {
    customerName: `customer-${Math.floor(Math.random() * 10000)}`,
    amount: (Math.random() * 200).toFixed(2),
  };
}

/** Sends one POST /orders and tallies it; resolves to the new id, or null on any failure. */
async function createOrder(): Promise<string | null> {
  try {
    const response = await fetch(`${TARGET_URL}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(randomOrder()),
    });

    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };

    if (!response.ok) {
      stats.rejected++;
      console.error(`${response.status} ${body.message ?? 'rejected'}`);
      return null;
    }

    stats.created++;
    console.log(`created ${body.id}`);
    return body.id ?? null;
  } catch (error) {
    stats.rejected++;
    console.error(`request failed: ${(error as Error).message}`);
    return null;
  }
}

/** Many orders at once — this is what makes the pollers race for the same rows. */
async function burst(count: number, concurrency: number): Promise<void> {
  for (let sent = 0; sent < count; sent += concurrency) {
    const size = Math.min(concurrency, count - sent);
    await Promise.all(Array.from({ length: size }, () => createOrder()));
  }
}

/** One order at a time — slow enough to follow on the dashboard. */
async function steady(count: number, intervalMs: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await createOrder();
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** Parses `<mode> <count> <second>` from argv (default `steady 20 1000`); prints usage and returns null if invalid. */
function readArgs(): { mode: LoadMode; count: number; second: number } | null {
  const [modeArg = LoadMode.Steady, countArg = '20', secondArg = '1000'] = process.argv.slice(2);

  if (!Object.values(LoadMode).includes(modeArg as LoadMode)) {
    console.error(USAGE);
    return null;
  }

  const count = Number(countArg);
  const second = Number(secondArg);
  if (!Number.isInteger(count) || count < 1 || !Number.isFinite(second) || second < 1) {
    console.error('count and the second argument must be positive numbers');
    return null;
  }

  return { mode: modeArg as LoadMode, count, second };
}

/** Runs the chosen traffic mode against TARGET_URL and prints the created/failed summary. */
async function main(): Promise<void> {
  const args = readArgs();
  if (!args) {
    process.exit(1);
  }

  console.log(`target ${TARGET_URL} — ${args.mode} ${args.count} ${args.second}`);

  if (args.mode === LoadMode.Burst) await burst(args.count, args.second);
  else await steady(args.count, args.second);

  console.log(`\n${stats.created} created, ${stats.rejected} failed`);
}

void main();
