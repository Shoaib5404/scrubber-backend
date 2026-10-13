import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';

/**
 * Nest lookup-cache Redis client (logical DB REDIS_LOOKUP_DB, default 1).
 * Fail-open: Redis errors return fallbacks and trip a short circuit breaker.
 * BullMQ / scheduler locks stay on REDIS_URL DB 0 via a separate connection.
 */
@Injectable()
export class RedisLookupStore implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisLookupStore.name);
  private readonly connection: IORedis;
  private readonly lookupDb: number;
  private failureCount = 0;
  private circuitOpenUntil: number | null = null;

  constructor(private readonly config: ConfigService) {
    const baseUrl =
      config.get<string>('REDIS_LOOKUP_URL') ??
      config.get<string>('REDIS_URL', 'redis://localhost:6381');
    this.lookupDb = config.get<number>('REDIS_LOOKUP_DB', 1);
    const url = withRedisDb(baseUrl, this.lookupDb);
    this.connection = new IORedis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      connectTimeout: 5_000,
      commandTimeout: 5_000,
      ...(config.get<boolean>('REDIS_TLS', false) ? { tls: {} } : {}),
      lazyConnect: false,
    });
    this.connection.on('error', (err) => {
      this.logger.warn(`Lookup Redis error event: ${err.message}`);
    });
  }

  onModuleInit() {
    this.logger.log(
      `Lookup cache Redis client ready (db=${this.lookupDb}, enabled=${this.enabled()})`,
    );
  }

  async onModuleDestroy() {
    this.connection.disconnect();
  }

  dbIndex(): number {
    return this.lookupDb;
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

  chunkBytes(): number {
    return this.config.get<number>('LOOKUP_CACHE_CHUNK_BYTES', 1_048_576);
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

  async mget(keys: string[]): Promise<Array<string | null>> {
    if (keys.length === 0) return [];
    return this.safe(async () => this.connection.mget(...keys), keys.map(() => null));
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

  /** SET multiple keys with the same TTL in one pipeline. */
  async setMany(entries: Array<{ key: string; value: string }>): Promise<boolean> {
    if (entries.length === 0) return true;
    return (await this.safe(async () => {
      const ttl = this.ttlSeconds();
      const pipeline = this.connection.pipeline();
      for (const { key, value } of entries) {
        if (ttl != null) {
          pipeline.setex(key, ttl, value);
        } else {
          pipeline.set(key, value);
        }
      }
      await pipeline.exec();
      return true;
    }, false)) as boolean;
  }

  async del(key: string): Promise<boolean> {
    return (await this.safe(async () => {
      await this.connection.del(key);
      return true;
    }, false)) as boolean;
  }

  async delMany(keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return this.safe(async () => this.connection.del(...keys), 0);
  }

  /** SCAN + DEL keys matching pattern. Prefer over KEYS / FLUSHDB. */
  async scanDelete(pattern: string): Promise<number> {
    return this.safe(async () => {
      let cursor = '0';
      let deleted = 0;
      do {
        const [nextCursor, keys] = await this.connection.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          500,
        );
        cursor = nextCursor;
        if (keys.length > 0) {
          deleted += await this.connection.del(...keys);
        }
      } while (cursor !== '0');
      return deleted;
    }, 0);
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
    u.pathname = `/${db}`;
    return u.toString();
  } catch {
    return url;
  }
}
