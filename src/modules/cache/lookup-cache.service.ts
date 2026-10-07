import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { nestGetOrLoadKey } from './cache.constants';
import { RedisLookupStore } from './redis-lookup.store';

/**
 * Nest port of Laravel LookupCacheService::getOrLoad + invalidate-after-commit.
 * Keys stay under LOOKUP_CACHE_KEY_PREFIX (default `lookup`); never put PHI in keys.
 */
@Injectable()
export class LookupCacheService {
  private readonly logger = new Logger(LookupCacheService.name);

  constructor(
    private readonly store: RedisLookupStore,
    private readonly config: ConfigService,
  ) {}

  isEnabled(): boolean {
    return this.store.enabled() && this.config.get<boolean>('LOOKUP_CACHE_ENABLED', true);
  }

  /**
   * Cold → loader + SET; warm → GET; disabled / circuit → loader only.
   * `key` is a logical name (no PHI); stored as `lookup:nest:{key}`.
   */
  async getOrLoad<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const redisKey = nestGetOrLoadKey(this.store.keyPrefix(), key);

    if (!this.isEnabled() || this.store.isCircuitOpen()) {
      return loader();
    }

    const cached = await this.store.get(redisKey);
    if (cached != null) {
      try {
        return JSON.parse(cached) as T;
      } catch {
        this.logger.warn(`Corrupt cache payload for ${redisKey}; reloading`);
      }
    }

    const value = await loader();
    try {
      await this.store.set(redisKey, JSON.stringify(value));
    } catch (e) {
      this.logger.warn(
        `Failed to write lookup cache ${redisKey}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    return value;
  }

  /**
   * Read-only cache check — no loader fallback, never writes. Returns null on a cache miss
   * (disabled/circuit-open also reads as a miss). Used by CLI inspection commands that need
   * to report hit/miss without forcing a load (e.g. ncci:rules-cache-fetch).
   */
  async peek<T>(key: string): Promise<T | null> {
    if (!this.isEnabled() || this.store.isCircuitOpen()) {
      return null;
    }
    const redisKey = nestGetOrLoadKey(this.store.keyPrefix(), key);
    const cached = await this.store.get(redisKey);
    if (cached == null) {
      return null;
    }
    try {
      return JSON.parse(cached) as T;
    } catch {
      this.logger.warn(`Corrupt cache payload for ${redisKey}`);
      return null;
    }
  }

  /** Drop a nest getOrLoad entry (call only after successful DB commit). */
  async invalidate(key: string): Promise<void> {
    const redisKey = nestGetOrLoadKey(this.store.keyPrefix(), key);
    await this.store.del(redisKey);
  }

  /** Drop Laravel-style table meta so next read rebuilds (post-commit only). */
  async invalidateTable(table: string): Promise<void> {
    const prefix = this.store.keyPrefix();
    await this.store.del(`${prefix}:meta:${table}`);
  }
}
