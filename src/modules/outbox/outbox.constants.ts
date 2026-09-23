/** Rows one poller tick may claim; the rest wait for the next tick or another instance. */
export const OUTBOX_BATCH_SIZE = 50;

export const OUTBOX_POLL_INTERVAL_MS = 2000;
