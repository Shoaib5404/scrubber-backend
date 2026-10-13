import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { recordCacheStatus } from './cache-telemetry';
import {
  LOOKUP_SCHEMA_VERSION,
  LookupCacheEnvelope,
  lookupChunkMetaKey,
  lookupChunkPartKey,
  lookupLogicalScanPattern,
  lookupTableScanPattern,
  lookupV1Key,
} from './cache.constants';
import { RedisLookupStore } from './redis-lookup.store';

/**
 * Nest-native lookup cache (cache-aside).
 * Keys: `lookup:v1:{logicalName}` or chunked `__meta` + `__chunk:N`.
 * PostgreSQL remains source of truth; Redis failures never fail the request.
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
   * Cold → loader + SET (chunked when needed); warm → GET; disabled / circuit → loader only.
   * `logicalName` must not contain PHI (e.g. `cpt_codes:by_code:abc123`).
   */
  async getOrLoad<T>(logicalName: string, loader: () => Promise<T>): Promise<T> {
    if (!this.isEnabled()) {
      recordCacheStatus('BYPASS');
      return loader();
    }

    if (this.store.isCircuitOpen()) {
      recordCacheStatus('ERROR');
      return loader();
    }

    const cached = await this.readEnvelope<T>(logicalName);
    if (cached !== undefined) {
      recordCacheStatus('HIT');
      return cached;
    }

    // Distinguish miss vs redis error: circuit may open during read.
    if (this.store.isCircuitOpen()) {
      recordCacheStatus('ERROR');
    } else {
      recordCacheStatus('MISS');
    }

    const value = await loader();
    await this.writeEnvelope(logicalName, value);
    return value;
  }

  /** Read-only — no loader, never writes. */
  async peek<T>(logicalName: string): Promise<T | null> {
    if (!this.isEnabled() || this.store.isCircuitOpen()) {
      return null;
    }
    const cached = await this.readEnvelope<T>(logicalName);
    return cached === undefined ? null : cached;
  }

  /** Drop one logical entry (single key and/or all chunks). */
  async invalidate(logicalName: string): Promise<void> {
    const pattern = lookupLogicalScanPattern(this.store.keyPrefix(), logicalName);
    await this.store.scanDelete(pattern);
  }

  /**
   * Drop every Nest v1 key under a table namespace (`lookup:v1:{table}:*`).
   * Also clears legacy `lookup:meta:{table}` keys if present.
   */
  async invalidateTable(table: string): Promise<void> {
    const prefix = this.store.keyPrefix();
    await this.store.scanDelete(lookupTableScanPattern(prefix, table));
    await this.store.del(`${prefix}:meta:${table}`);
  }

  /** Flush all lookup keys under the configured prefix on DB 1. */
  async flushAllLookupKeys(): Promise<number> {
    return this.store.scanDelete(`${this.store.keyPrefix()}:*`);
  }

  /** Stable discriminator for sorted code lists. */
  hashCodes(codes: readonly string[]): string {
    const normalized = [...codes]
      .map((c) => String(c).trim().toUpperCase())
      .filter(Boolean)
      .sort();
    return createHash('sha256').update(normalized.join('|')).digest('hex').slice(0, 24);
  }

  // ── read / write envelope + chunks ──────────────────────────────────────

  private async readEnvelope<T>(logicalName: string): Promise<T | undefined> {
    const prefix = this.store.keyPrefix();
    const baseKey = lookupV1Key(prefix, logicalName);
    const metaKey = lookupChunkMetaKey(prefix, logicalName);

    const [singleRaw, metaRaw] = await this.store.mget([baseKey, metaKey]);

    if (singleRaw != null) {
      return this.parseSingleEnvelope<T>(singleRaw, logicalName);
    }

    if (metaRaw != null) {
      return this.readChunkedEnvelope<T>(logicalName, metaRaw);
    }

    return undefined;
  }

  private parseSingleEnvelope<T>(raw: string, logicalName: string): T | undefined {
    try {
      const envelope = JSON.parse(raw) as LookupCacheEnvelope<T>;
      if (envelope.schemaVersion !== LOOKUP_SCHEMA_VERSION) {
        this.logger.warn(`Unsupported cache schema for ${logicalName}; reloading`);
        return undefined;
      }
      if (envelope.chunked) {
        return undefined;
      }
      return envelope.data as T;
    } catch {
      this.logger.warn(`Corrupt cache payload for ${logicalName}; reloading`);
      return undefined;
    }
  }

  private async readChunkedEnvelope<T>(
    logicalName: string,
    metaRaw: string,
  ): Promise<T | undefined> {
    try {
      const meta = JSON.parse(metaRaw) as LookupCacheEnvelope;
      if (meta.schemaVersion !== LOOKUP_SCHEMA_VERSION || !meta.chunked) {
        return undefined;
      }
      const chunkCount = meta.chunkCount ?? 0;
      if (chunkCount < 1) return undefined;

      const prefix = this.store.keyPrefix();
      const chunkKeys = Array.from({ length: chunkCount }, (_, i) =>
        lookupChunkPartKey(prefix, logicalName, i),
      );
      const parts = await this.store.mget(chunkKeys);
      if (parts.some((p) => p == null)) {
        this.logger.warn(`Incomplete chunk set for ${logicalName}; reloading`);
        return undefined;
      }

      const parsedParts = parts.map((p) => JSON.parse(p as string));
      return reassembleChunkedData<T>(parsedParts);
    } catch {
      this.logger.warn(`Corrupt chunked cache for ${logicalName}; reloading`);
      return undefined;
    }
  }

  private async writeEnvelope<T>(logicalName: string, value: T): Promise<void> {
    try {
      const prefix = this.store.keyPrefix();
      const maxBytes = this.store.chunkBytes();
      const cachedAt = new Date().toISOString();

      const single: LookupCacheEnvelope<T> = {
        schemaVersion: LOOKUP_SCHEMA_VERSION,
        cachedAt,
        chunked: false,
        data: value,
      };
      const singleJson = JSON.stringify(single);

      // Clear any previous chunk set for this logical name first.
      await this.invalidate(logicalName);

      if (utf8Bytes(singleJson) <= maxBytes) {
        await this.store.set(lookupV1Key(prefix, logicalName), singleJson);
        return;
      }

      const chunks = splitIntoChunks(value, maxBytes);
      const meta: LookupCacheEnvelope = {
        schemaVersion: LOOKUP_SCHEMA_VERSION,
        cachedAt,
        chunked: true,
        chunkCount: chunks.length,
        rowCount: Array.isArray(value) ? value.length : undefined,
      };

      const entries: Array<{ key: string; value: string }> = [
        { key: lookupChunkMetaKey(prefix, logicalName), value: JSON.stringify(meta) },
      ];
      for (let i = 0; i < chunks.length; i += 1) {
        entries.push({
          key: lookupChunkPartKey(prefix, logicalName, i),
          value: JSON.stringify(chunks[i]),
        });
      }
      const ok = await this.store.setMany(entries);
      if (ok) {
        this.logger.debug(
          `Stored ${logicalName} in ${chunks.length} chunk(s) (max ${maxBytes} bytes each)`,
        );
      }
    } catch (e) {
      this.logger.warn(
        `Failed to write lookup cache ${logicalName}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}

function utf8Bytes(s: string): number {
  return Buffer.byteLength(s, 'utf8');
}

/**
 * Split value into JSON-serializable chunk payloads, each fitting under maxBytes
 * when stringified (with small safety margin).
 */
function splitIntoChunks<T>(value: T, maxBytes: number): unknown[] {
  const budget = Math.max(256, maxBytes - 64);

  if (Array.isArray(value)) {
    return chunkArray(value as unknown[], budget);
  }

  if (value != null && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>);
    const entryChunks = chunkArray(entries, budget);
    return entryChunks.map((chunk) => Object.fromEntries(chunk as [string, unknown][]));
  }

  // Scalar / other — fall back to UTF-8 string slicing of JSON.
  const raw = JSON.stringify(value);
  const parts: string[] = [];
  let offset = 0;
  while (offset < raw.length) {
    let end = offset;
    let size = 0;
    while (end < raw.length) {
      const cp = raw.codePointAt(end) ?? 0;
      const char = String.fromCodePoint(cp);
      const charBytes = utf8Bytes(char);
      if (size + charBytes > budget && end > offset) break;
      size += charBytes;
      end += char.length;
    }
    parts.push(raw.slice(offset, end));
    offset = end;
  }
  return parts.map((p) => ({ __jsonSlice: true, part: p }));
}

function chunkArray(items: unknown[], budget: number): unknown[][] {
  const out: unknown[][] = [];
  let current: unknown[] = [];
  let currentSize = 2; // []

  for (const item of items) {
    const itemJson = JSON.stringify(item);
    const itemSize = utf8Bytes(itemJson) + (current.length > 0 ? 1 : 0);
    if (current.length > 0 && currentSize + itemSize > budget) {
      out.push(current);
      current = [];
      currentSize = 2;
    }
    // Single item larger than budget — still store alone (must not skip).
    if (current.length === 0 && utf8Bytes(itemJson) + 2 > budget) {
      out.push([item]);
      continue;
    }
    current.push(item);
    currentSize += itemSize;
  }
  if (current.length > 0) out.push(current);
  return out.length > 0 ? out : [[]];
}

function reassembleChunkedData<T>(parts: unknown[]): T {
  if (parts.length === 0) return [] as unknown as T;

  const first = parts[0];
  if (
    first != null &&
    typeof first === 'object' &&
    !Array.isArray(first) &&
    (first as { __jsonSlice?: boolean }).__jsonSlice === true
  ) {
    const joined = parts
      .map((p) => (p as { part: string }).part)
      .join('');
    return JSON.parse(joined) as T;
  }

  if (Array.isArray(first)) {
    return (parts as unknown[][]).flat() as T;
  }

  // Object map chunks
  return Object.assign({}, ...parts) as T;
}
