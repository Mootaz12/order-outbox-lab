import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `updated_at` and `deleted_at` for the tables whose entities extend BaseEntity.
 * Existing rows start with `updated_at = created_at` rather than the migration time,
 * so the column never claims a row changed when it didn't.
 */
export class AddAuditColumns1790176533219 implements MigrationInterface {
  name = 'AddAuditColumns1790176533219';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['orders', 'outbox']) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
          ADD COLUMN "updated_at" timestamptz NOT NULL DEFAULT now(),
          ADD COLUMN "deleted_at" timestamptz
      `);
      await queryRunner.query(`UPDATE "${table}" SET "updated_at" = "created_at"`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['outbox', 'orders']) {
      await queryRunner.query(`
        ALTER TABLE "${table}" DROP COLUMN "deleted_at", DROP COLUMN "updated_at"
      `);
    }
  }
}
