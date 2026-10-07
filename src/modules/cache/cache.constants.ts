/** Laravel config/lookup_cache.php — key prefix is `lookup` (not ns_prod). */
export const LOOKUP_KEY_PREFIX_DEFAULT = 'lookup';

export const LOOKUP_META_KIND = 'meta';
export const LOOKUP_ROWS_KIND = 'rows';
export const LOOKUP_IDX_KIND = 'idx';
export const LOOKUP_GRP_KIND = 'grp';

/** Nest helper keys for getOrLoad (still under lookup: prefix; no PHI). */
export const LOOKUP_NEST_KIND = 'nest';

export function lookupMetaKey(prefix: string, table: string): string {
  return `${prefix}:${LOOKUP_META_KIND}:${table}`;
}

export function lookupDataKey(
  prefix: string,
  table: string,
  profile: 'rows' | 'idx_map' | 'group_rows',
  version: number,
): string {
  const kind =
    profile === 'idx_map' ? LOOKUP_IDX_KIND : profile === 'group_rows' ? LOOKUP_GRP_KIND : LOOKUP_ROWS_KIND;
  return `${prefix}:${kind}:${table}:v${version}`;
}

export function nestGetOrLoadKey(prefix: string, name: string): string {
  return `${prefix}:${LOOKUP_NEST_KIND}:${name}`;
}

/** Aligns with Laravel NcciRulesCacheService::CACHE_GROUP / chunked full table. */
export const NCCI_FULL_TABLE_CACHE_NAME = 'ncci_rules:full_table_v2';
