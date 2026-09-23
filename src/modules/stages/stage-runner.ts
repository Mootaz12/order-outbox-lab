import { Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AppConfig } from '../../config';
import { StageRetryStatus, StageStatus } from '../../shared/pipeline';
import { enqueueOutbox } from '../outbox/enqueue-outbox';
import { StageRetry } from './stage-retry.entity';
import { StageEventsService } from '../stage-events/stage-events.service';
import { backoffMs, nextActionAfterFailure } from './retry-policy';
import { simulatedDelayMs, simulatedFailure } from './stage-simulation';
import { InsertedIdRow, RetryCounterRow, RetryDecision, StageConfig } from './stages.types';

/**
 * The shape every stage shares: claim the attempt, do the work, record the outcome,
 * and either finish or hand a durable retry back to the outbox. Subclasses only
 * supply their config and their two `@OnEvent` entry points — see `stageHandler()`.
 */
export abstract class StageRunner {
  protected readonly logger = new Logger(this.constructor.name);
  protected readonly instanceId: string;
  protected abstract readonly config: StageConfig;

  constructor(
    protected readonly dataSource: DataSource,
    protected readonly stageEvents: StageEventsService,
    app: AppConfig,
  ) {
    this.instanceId = app.instanceId;
  }

  /**
   * Total on purpose — nothing inside may escape as a rejection. `@OnEvent` handlers
   * are dispatched by eventemitter2's synchronous `emit`, which discards the promise a
   * handler returns, so a rejection here surfaces as an unhandledRejection and Node 20
   * answers those by exiting: an instance with a green healthcheck dies on a transient
   * query error. Losing one attempt is the lesser failure.
   */
  async run(orderId: string, attempt: number): Promise<void> {
    try {
      await this.attempt(orderId, attempt);
    } catch (error) {
      const reason = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `[${this.instanceId}] ${this.config.stage} attempt ${attempt} for order ${orderId} ` +
          `aborted: ${reason.message}. Its outbox row is already marked processed, so nothing ` +
          `will re-run this stage without a manual re-enqueue.`,
        reason.stack,
      );
    }
  }

  private async attempt(orderId: string, attempt: number): Promise<void> {
    if (!(await this.claim(orderId, attempt))) return;

    const started = Date.now();
    const delay = simulatedDelayMs(this.config, Math.random());
    await new Promise((resolve) => setTimeout(resolve, delay));
    const durationMs = Date.now() - started;

    const failure = simulatedFailure(this.config, Math.random());
    if (!failure) {
      const detail = `${durationMs}ms`;
      await this.record(orderId, attempt, StageStatus.Completed, detail);
      await this.publish(orderId, attempt, StageStatus.Completed, detail);
      this.logger.log(
        `[${this.instanceId}] ${this.config.stage} ok — order ${orderId} attempt ${attempt} in ${durationMs}ms`,
      );
      return;
    }

    const outcome = await this.fail(orderId, attempt, failure);
    this.logger.warn(
      `[${this.instanceId}] ${this.config.stage} failed — order ${orderId} attempt ${attempt}: ${failure} (${outcome})`,
    );
  }

  /**
   * Inserting the `started` row *is* the claim. A duplicate delivery of the same
   * attempt collides on the unique index and inserts nothing, which is how this
   * stage stays single-run per attempt despite at-least-once event delivery.
   */
  private async claim(orderId: string, attempt: number): Promise<boolean> {
    if (await this.record(orderId, attempt, StageStatus.Started, null)) {
      await this.publish(orderId, attempt, StageStatus.Started, null);
      return true;
    }

    this.logger.debug(
      `[${this.instanceId}] ${this.config.stage} attempt ${attempt} for order ${orderId} already claimed — skipped`,
    );
    return false;
  }

  /**
   * One transaction holds the failure row, the retry counter and the queued retry, so
   * a stage can never be recorded as failed without its retry existing — and the
   * retry survives the death of this process, unlike a setTimeout backoff would.
   */
  private async fail(orderId: string, attempt: number, error: string): Promise<RetryDecision> {
    const decision = await this.dataSource.transaction(async (manager) => {
      await this.record(orderId, attempt, StageStatus.Failed, error, manager);

      const [counter] = await manager.query<RetryCounterRow[]>(
        `INSERT INTO stage_retries (order_id, stage, retry_count, status, last_error)
         VALUES ($1, $2, 1, $4, $3)
         ON CONFLICT (order_id, stage)
         DO UPDATE SET retry_count = stage_retries.retry_count + 1,
                       last_error = EXCLUDED.last_error
         RETURNING retry_count`,
        [orderId, this.config.stage, error, StageRetryStatus.Pending],
      );
      const outcome = nextActionAfterFailure(Number(counter.retry_count));

      if (outcome === RetryDecision.DeadLetter) {
        await manager.update(
          StageRetry,
          { orderId, stage: this.config.stage },
          { status: StageRetryStatus.DeadLettered },
        );
      } else {
        await enqueueOutbox(manager, {
          orderId,
          stage: this.config.stage,
          attempt: attempt + 1,
          availableAt: new Date(Date.now() + backoffMs(attempt)),
        });
      }

      return outcome;
    });

    // After the commit, deliberately: the status watcher answers "is this order
    // dead?" by reading stage_retries, and a subscriber notified mid-transaction
    // cannot see the dead_lettered row yet. Since a dead letter is the last event
    // that order will ever emit, publishing early left the order pending forever.
    await this.publish(orderId, attempt, StageStatus.Failed, error);
    return decision;
  }

  /**
   * The one write into the audit log. `ON CONFLICT DO NOTHING` is not only for the
   * claim: a duplicate delivery reaching `completed` would otherwise break the unique
   * index and throw for a row that is already correct on disk.
   */
  private async record(
    orderId: string,
    attempt: number,
    status: StageStatus,
    detail: string | null,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<boolean> {
    const inserted = await manager.query<InsertedIdRow[]>(
      `INSERT INTO order_stage_events (order_id, stage, status, attempt, detail)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [orderId, this.config.stage, status, attempt, detail],
    );
    return inserted.length > 0;
  }

  private publish(
    orderId: string,
    attempt: number,
    status: StageStatus,
    detail: string | null,
  ): Promise<void> {
    return this.stageEvents
      .publish({
        orderId,
        stage: this.config.stage,
        status,
        attempt,
        detail,
        createdAt: new Date().toISOString(),
      })
      .catch((error: Error) => {
        // The live stream is a read model; Postgres still has the row, so a failed
        // publish costs a frame on the dashboard and nothing more.
        this.logger.warn(`could not publish ${this.config.stage} ${status}: ${error.message}`);
      });
  }
}
