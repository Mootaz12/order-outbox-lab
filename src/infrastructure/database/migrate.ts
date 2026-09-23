import { createDataSource } from './data-source';

/**
 * Entry point of the one-shot `migrator` service: applies pending migrations in one
 * transaction and exits, which is what gates the app containers (see docs/architecture.md).
 */
async function main() {
  const dataSource = createDataSource();
  await dataSource.initialize();
  const applied = await dataSource.runMigrations({ transaction: 'all' });
  const names = applied.map((m) => m.name).join(', ');
  console.log(
    applied.length === 0
      ? 'migrations: already up to date'
      : `migrations applied: ${names}`,
  );
  await dataSource.destroy();
}

main().catch((error) => {
  console.error('migration failed', error);
  process.exit(1);
});
