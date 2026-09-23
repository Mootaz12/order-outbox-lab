import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { eventBusConfig, EventBusConfig } from '@config';
import { EventBus } from './event-bus';
import { DEFAULT_PING_DEADLINE_MS } from './event-bus.constants';
import { EventHandler } from './event-bus.types';

/**
 * Redis pub/sub driver. Two connections, as Redis pub/sub requires: one that may issue
 * commands and publish, one pinned to subscriber mode. ioredis re-subscribes
 * automatically after a reconnect, so a dropped connection self-heals.
 */
@Injectable()
export class RedisEventBus extends EventBus implements OnModuleDestroy {
  private readonly logger = new Logger(RedisEventBus.name);
  private readonly publisher: Redis;
  private readonly subscriber: Redis;
  private readonly handlers = new Map<string, Set<EventHandler<unknown>>>();

  constructor(@Inject(eventBusConfig.KEY) config: EventBusConfig) {
    super();
    this.publisher = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
    this.subscriber = this.publisher.duplicate();
    this.subscriber.on('message', (channel: string, raw: string) => this.dispatch(channel, raw));
  }

  /** JSON-encodes `payload` and publishes it on the command connection. */
  async publish<T>(channel: string, payload: T): Promise<void> {
    await this.publisher.publish(channel, JSON.stringify(payload));
  }

  /** Adds a local handler; only the first handler per channel issues a Redis SUBSCRIBE. */
  async subscribe<T>(channel: string, handler: EventHandler<T>): Promise<void> {
    const existing = this.handlers.get(channel);
    if (existing) {
      existing.add(handler as EventHandler<unknown>);
      return;
    }
    this.handlers.set(channel, new Set([handler as EventHandler<unknown>]));
    await this.subscriber.subscribe(channel);
  }

  /**
   * PINGs Redis, rejecting after `deadlineMs`: queued commands (`maxRetriesPerRequest: null`)
   * would otherwise hang a health probe forever while Redis is down.
   */
  async ping(deadlineMs = DEFAULT_PING_DEADLINE_MS): Promise<void> {
    await Promise.race([
      this.publisher.ping(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`ping timed out after ${deadlineMs}ms`)), deadlineMs),
      ),
    ]);
  }

  /** Closes both connections on shutdown. */
  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.publisher.quit(), this.subscriber.quit()]);
  }

  /** Parses one message and hands it to every local handler; a bad message or handler is logged, never thrown. */
  private dispatch(channel: string, raw: string): void {
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      this.logger.warn(`ignoring malformed message on ${channel}`);
      return;
    }
    for (const handler of this.handlers.get(channel) ?? []) {
      try {
        handler(payload);
      } catch (error) {
        this.logger.error(`handler for ${channel} failed`, (error as Error).stack);
      }
    }
  }
}
