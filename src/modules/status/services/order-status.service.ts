import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OrderStatus, STAGE_COUNT, StageRetryStatus, StageStatus } from '@shared/pipeline';
import { StageEventsService } from '@modules/stage-events/services/stage-events.service';

/**
 * Owns the one decision no individual stage can make: whether the order as a whole
 * is done. Both statements derive their answer from Postgres rather than from
 * counting events in memory, so they stay correct when the three stages of one order
 * were processed by three different instances. The `status = 'pending'` guard makes
 * concurrent duplicate triggers harmless.
 */
@Injectable()
export class OrderStatusService implements OnModuleInit {
  private readonly logger = new Logger(OrderStatusService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly stageEvents: StageEventsService,
  ) {}

  async onModuleInit(): Promise<void> {
    // `settled`, not every frame: a `started` row can never change an order's status, and
    // skipping it halves the queries this watcher issues under load.
    this.stageEvents.settled().subscribe((event) => {
      this.recompute(event.orderId).catch((error: Error) => {
        this.logger.error(`status recompute failed for ${event.orderId}: ${error.message}`);
      });
    });
  }

  private async recompute(orderId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE orders o
          SET status = $2, updated_at = now()
        WHERE o.id = $1
          AND o.status = $3
          AND (SELECT count(DISTINCT stage)
                 FROM order_stage_events
                WHERE order_id = o.id AND status = $4) = $5`,
      [orderId, OrderStatus.Fulfilled, OrderStatus.Pending, StageStatus.Completed, STAGE_COUNT],
    );

    await this.dataSource.query(
      `UPDATE orders o
          SET status = $2, updated_at = now()
        WHERE o.id = $1
          AND o.status = $3
          AND EXISTS (SELECT 1 FROM stage_retries sr
                       WHERE sr.order_id = o.id AND sr.status = $4)`,
      [
        orderId,
        OrderStatus.Failed,
        OrderStatus.Pending,
        StageRetryStatus.DeadLettered,
      ],
    );
  }
}
