import { createDataSource } from './data-source';

/**
 * Entry point for the one-shot `migrator` compose service. Runs the compiled
 * migrations and exits, so `depends_on: service_completed_successfully` can gate
 * the app instances on the schema actually existing.
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
