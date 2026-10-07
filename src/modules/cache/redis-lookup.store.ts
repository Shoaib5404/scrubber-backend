import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';

/**
 * Laravel RedisLookupStore — Redis DB for lookups (default logical DB 2),
 * circuit breaker, optional TTL.
 */
@Injectable()
export class RedisLookupStore implements OnModuleDestroy {
  private readonly logger = new Logger(RedisLookupStore.name);
  private readonly connection: IORedis;
  private failureCount = 0;
  private circuitOpenUntil: number | null = null;

  constructor(private readonly config: ConfigService) {
    const baseUrl = config.get<string>('REDIS_LOOKUP_URL') ?? config.get<string>('REDIS_URL', 'redis://localhost:6381');
    const db = config.get<number>('REDIS_LOOKUP_DB', 2);
    const url = withRedisDb(baseUrl, db);
    this.connection = new IORedis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      ...(config.get<boolean>('REDIS_TLS', false) ? { tls: {} } : {}),
    });
  }

  async onModuleDestroy() {
    this.connection.disconnect();
  }

  enabled(): boolean {
    return this.config.get<boolean>('LOOKUP_CACHE_ENABLED', true);
  }

  keyPrefix(): string {
    return this.config.get<string>('LOOKUP_CACHE_KEY_PREFIX', 'lookup');
  }

  ttlSeconds(): number | null {
    const ttl = this.config.get<number | null>('LOOKUP_CACHE_TTL', 31_536_000);
    if (ttl == null || ttl <= 0) return null;
    return ttl;
  }

  isCircuitOpen(): boolean {
    if (this.circuitOpenUntil == null) return false;
    if (Date.now() >= this.circuitOpenUntil) {
      this.circuitOpenUntil = null;
      this.failureCount = 0;
      return false;
    }
    return true;
  }

  async get(key: string): Promise<string | null> {
    return this.safe(async () => this.connection.get(key), null);
  }

  async set(key: string, value: string): Promise<boolean> {
    return (await this.safe(async () => {
      const ttl = this.ttlSeconds();
      if (ttl != null) {
        await this.connection.setex(key, ttl, value);
      } else {
        await this.connection.set(key, value);
      }
      return true;
    }, false)) as boolean;
  }

  async del(key: string): Promise<boolean> {
    return (await this.safe(async () => {
      await this.connection.del(key);
      return true;
    }, false)) as boolean;
  }

  /** Test helper — raw client for integration assertions. */
  raw(): IORedis {
    return this.connection;
  }

  private async safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    if (this.isCircuitOpen()) return fallback;
    try {
      const result = await fn();
      this.failureCount = 0;
      return result;
    } catch (e) {
      this.failureCount += 1;
      this.logger.warn(`Lookup cache Redis error: ${e instanceof Error ? e.message : String(e)}`);
      if (this.failureCount >= 3) {
        this.circuitOpenUntil = Date.now() + 30_000;
        this.logger.warn('Lookup cache circuit opened for 30s after repeated Redis failures');
      }
      return fallback;
    }
  }
}

function withRedisDb(url: string, db: number): string {
  try {
    const u = new URL(url);
    // redis://host:port/db
    u.pathname = `/${db}`;
    return u.toString();
  } catch {
    return url;
  }
}
