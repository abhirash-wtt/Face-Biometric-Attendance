import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private memory = new Map<string, { value: string; exp: number }>();
  private warned = false;

  constructor(private readonly config: ConfigService) {
    try {
      const client = new Redis({
        host: this.config.get<string>('redis.host'),
        port: this.config.get<number>('redis.port'),
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        lazyConnect: true,
        connectTimeout: 400,
        retryStrategy: () => null,
      });
      client.on('error', () => this.fallback(client, 'Redis unavailable.'));
      this.client = client;
      client.connect().catch(() => this.fallback(client, 'Redis unavailable.'));
    } catch {
      this.fallback(null, 'Redis init failed.');
    }
  }

  private fallback(client: Redis | null, reason: string) {
    if (!this.warned) {
      this.logger.warn(`${reason} Using in-memory fallback.`);
      this.warned = true;
    }
    try {
      client?.disconnect();
    } catch {
      /* ignore */
    }
    if (this.client === client) this.client = null;
  }

  async set(key: string, value: string, ttlSec?: number) {
    if (this.client) {
      try {
        if (ttlSec) await this.client.set(key, value, 'EX', ttlSec);
        else await this.client.set(key, value);
        return;
      } catch {
        this.fallback(this.client, 'Redis write failed.');
      }
    }
    const exp = ttlSec ? Date.now() + ttlSec * 1000 : Number.MAX_SAFE_INTEGER;
    this.memory.set(key, { value, exp });
  }

  async get(key: string): Promise<string | null> {
    if (this.client) {
      try {
        return await this.client.get(key);
      } catch {
        this.fallback(this.client, 'Redis read failed.');
      }
    }
    const row = this.memory.get(key);
    if (!row) return null;
    if (row.exp < Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return row.value;
  }

  async del(key: string) {
    if (this.client) {
      try {
        await this.client.del(key);
        return;
      } catch {
        this.fallback(this.client, 'Redis delete failed.');
      }
    }
    this.memory.delete(key);
  }
}
