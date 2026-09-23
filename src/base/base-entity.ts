import {
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Columns shared by tables keyed by a database-generated uuid (`gen_random_uuid()`).
 * Abstract and undecorated with `@Entity`, so it adds columns to its subclasses without
 * becoming a table itself — and the file name deliberately stays outside the
 * `*.entity.ts` glob. TypeORM exports an active-record class with the same name: import
 * this one from `@base/base-entity`, never `BaseEntity` from 'typeorm'.
 */
export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  /**
   * TypeORM stamps this on `save()` and query-builder `update()`. Raw SQL bypasses it,
   * so a hand-written `UPDATE` on one of these tables must set `updated_at = now()`.
   */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  /**
   * Soft delete: repository reads skip rows where this is set. Nothing deletes yet;
   * raw SQL that should honour it needs its own `deleted_at IS NULL`.
   */
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
