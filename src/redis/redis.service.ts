import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { env } from '../common/env';

type Handler = (raw: string) => void;

/**
 * Two connections, as Redis pub/sub requires: one that may issue commands and
 * publish, one pinned to subscriber mode. ioredis re-subscribes automatically
 * after a reconnect, so a dropped connection self-heals.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly publisher: Redis;
  private readonly subscriber: Redis;
  private readonly handlers = new Map<string, Set<Handler>>();

  constructor() {
    this.publisher = new Redis(env.redisUrl, { maxRetriesPerRequest: null });
    this.subscriber = this.publisher.duplicate();
    this.subscriber.on('message', (channel: string, raw: string) => {
      for (const handler of this.handlers.get(channel) ?? []) {
        try {
          handler(raw);
        } catch (error) {
          this.logger.error(`handler for ${channel} failed`, (error as Error).stack);
        }
      }
    });
  }

  /**
   * `maxRetriesPerRequest: null` means a command issued while Redis is down is queued
   * rather than rejected — which is right for publishing but would let a health probe
   * hang forever, so the caller gets a deadline.
   */
  async ping(deadlineMs = 1500): Promise<void> {
    await Promise.race([
      this.publisher.ping(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`ping timed out after ${deadlineMs}ms`)), deadlineMs),
      ),
    ]);
  }

  async publish(channel: string, payload: unknown): Promise<void> {
    await this.publisher.publish(channel, JSON.stringify(payload));
  }

  async subscribe(channel: string, handler: Handler): Promise<void> {
    const existing = this.handlers.get(channel);
    if (existing) {
      existing.add(handler);
      return;
    }
    this.handlers.set(channel, new Set([handler]));
    await this.subscriber.subscribe(channel);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.publisher.quit(), this.subscriber.quit()]);
  }
}
