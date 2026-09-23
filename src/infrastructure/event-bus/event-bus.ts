import { EventHandler } from './event-bus.types';

/**
 * Cross-instance publish/subscribe: every subscriber on every instance receives every
 * message published to a channel. That fan-out is the contract — a replacement driver
 * must broadcast, not load-balance, or two-thirds of SSE clients go silent.
 *
 * The abstract class doubles as the DI token, so consumers depend on this and never on
 * a driver. Swap the driver in `EventBusModule`.
 */
export abstract class EventBus {
  /** Serialization is the driver's job; payloads go in and come out as values. */
  abstract publish<T>(channel: string, payload: T): Promise<void>;

  abstract subscribe<T>(channel: string, handler: EventHandler<T>): Promise<void>;

  /** Rejects if the backing service is unreachable within the deadline. */
  abstract ping(deadlineMs?: number): Promise<void>;
}
