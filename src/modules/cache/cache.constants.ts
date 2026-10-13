/** Nest-native lookup cache key prefix. */
export const LOOKUP_KEY_PREFIX_DEFAULT = 'lookup';
export const LOOKUP_KEY_VERSION = 'v1';

export const LOOKUP_SCHEMA_VERSION = 1;

/** Logical getOrLoad name for full active NCCI snapshot (may be chunked). */
export const NCCI_FULL_TABLE_CACHE_NAME = 'nccis:full:active';

/** Suffixes for chunked payloads. */
export const LOOKUP_CHUNK_META_SUFFIX = '__meta';
export const LOOKUP_CHUNK_PART_PREFIX = '__chunk:';

export type LookupCacheEnvelope<T = unknown> = {
  schemaVersion: number;
  cachedAt: string;
  chunked?: boolean;
  chunkCount?: number;
  rowCount?: number;
  data?: T;
};

/** `lookup:v1:{logicalName}` — single-blob or base for chunked keys. */
export function lookupV1Key(prefix: string, logicalName: string): string {
  return `${prefix}:${LOOKUP_KEY_VERSION}:${logicalName}`;
}

export function lookupChunkMetaKey(prefix: string, logicalName: string): string {
  return `${lookupV1Key(prefix, logicalName)}:${LOOKUP_CHUNK_META_SUFFIX}`;
}

export function lookupChunkPartKey(prefix: string, logicalName: string, index: number): string {
  return `${lookupV1Key(prefix, logicalName)}:${LOOKUP_CHUNK_PART_PREFIX}${index}`;
}

/** SCAN pattern for a logical entry (single + all chunks). */
export function lookupLogicalScanPattern(prefix: string, logicalName: string): string {
  return `${lookupV1Key(prefix, logicalName)}*`;
}

/** SCAN pattern for an entire table namespace (`table:…`). */
export function lookupTableScanPattern(prefix: string, table: string): string {
  return `${prefix}:${LOOKUP_KEY_VERSION}:${table}:*`;
}

/**
 * @deprecated Prefer lookupV1Key — kept so older tests compiling against nestGetOrLoadKey
 * still resolve to the Nest-native v1 key space.
 */
export function nestGetOrLoadKey(prefix: string, name: string): string {
  return lookupV1Key(prefix, name);
}

/** @deprecated Legacy meta key shape; Nest v1 uses lookupV1Key / chunks. */
export function lookupMetaKey(prefix: string, table: string): string {
  return `${prefix}:meta:${table}`;
}

/** Build `table:profile:discriminator` logical names. */
export function lookupLogicalName(table: string, profile: string, discriminator: string): string {
  return `${table}:${profile}:${discriminator}`;
}
