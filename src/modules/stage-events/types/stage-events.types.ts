import { StageName, StageStatus } from '@shared/pipeline';

/**
 * The payload published on `EventChannel.StageEvents` and sent verbatim as the `data`
 * of each SSE `stage` event. Stages build it, the status watcher and the dashboard read
 * it, so it is the one wire contract between them.
 */
export interface StageEventFrame {
  orderId: string;
  stage: StageName;
  status: StageStatus;
  attempt: number;
  detail: string | null;
  /**
   * ISO timestamp matching the `created_at` the hydration endpoint returns, so the
   * dashboard renders both paths through the same field. Without it a live frame
   * falls back to the browser clock and the timeline column lies about ordering.
   */
  createdAt: string;
}
