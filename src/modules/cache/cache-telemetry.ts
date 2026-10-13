import { AsyncLocalStorage } from 'async_hooks';

export type CacheHeaderStatus = 'HIT' | 'MISS' | 'BYPASS' | 'ERROR';

type CacheTelemetryState = {
  /** Precedence: ERROR > MISS > HIT > BYPASS (unset). */
  status: CacheHeaderStatus | null;
};

const storage = new AsyncLocalStorage<CacheTelemetryState>();

export function runWithCacheTelemetry<T>(fn: () => T): T {
  return storage.run({ status: null }, fn);
}

/** Express/Nest middleware entry — keeps ALS for the whole request. */
export function installCacheTelemetryMiddleware(
  req: unknown,
  res: unknown,
  next: () => void,
): void {
  runWithCacheTelemetry(() => next());
}

export function recordCacheStatus(next: CacheHeaderStatus): void {
  const state = storage.getStore();
  if (!state) return;
  state.status = mergeCacheStatus(state.status, next);
}

export function readCacheStatus(): CacheHeaderStatus | null {
  return storage.getStore()?.status ?? null;
}

function mergeCacheStatus(
  current: CacheHeaderStatus | null,
  next: CacheHeaderStatus,
): CacheHeaderStatus {
  if (current === 'ERROR' || next === 'ERROR') return 'ERROR';
  if (current === 'MISS' || next === 'MISS') return 'MISS';
  if (current === 'HIT' || next === 'HIT') return 'HIT';
  return 'BYPASS';
}
