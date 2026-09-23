import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1700000000000 implements MigrationInterface {
  name = 'InitSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "customer_name" text NOT NULL,
        "amount"        numeric NOT NULL,
        "status"        text NOT NULL DEFAULT 'pending',
        "created_at"    timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "outbox" (
        "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "order_id"     uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
        "payload"      jsonb NOT NULL,
        "stage"        text,
        "processed"    boolean NOT NULL DEFAULT false,
        "created_at"   timestamptz NOT NULL DEFAULT now(),
        "available_at" timestamptz NOT NULL DEFAULT now(),
        "processed_at" timestamptz
      )
    `);

    // Matches the poller's claim predicate: processed = false AND available_at <= now().
    await queryRunner.query(`
      CREATE INDEX "idx_outbox_claimable" ON "outbox" ("processed", "available_at")
    `);

    await queryRunner.query(`
      CREATE TABLE "order_stage_events" (
        "id"         bigserial PRIMARY KEY,
        "order_id"   uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
        "stage"      text NOT NULL,
        "status"     text NOT NULL,
        "attempt"    int NOT NULL DEFAULT 1,
        "detail"     text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        -- status belongs in this key: the started and completed rows for one attempt
        -- must coexist, while a duplicate delivery re-inserting started for the same
        -- attempt must collide and be discarded.
        CONSTRAINT "uq_stage_attempt" UNIQUE ("order_id", "stage", "attempt", "status")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "stage_retries" (
        "order_id"    uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
        "stage"       text NOT NULL,
        "retry_count" int NOT NULL DEFAULT 0,
        "status"      text NOT NULL DEFAULT 'pending',
        "last_error"  text,
        PRIMARY KEY ("order_id", "stage")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "stage_retries"`);
    await queryRunner.query(`DROP TABLE "order_stage_events"`);
    await queryRunner.query(`DROP INDEX "idx_outbox_claimable"`);
    await queryRunner.query(`DROP TABLE "outbox"`);
    await queryRunner.query(`DROP TABLE "orders"`);
  }
}
