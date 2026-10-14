import { AsyncLocalStorage } from 'async_hooks';
import type { AuthPrincipal } from '../auth/auth.types';

export type AuditRequestContext = {
  requestId?: string;
  ip?: string;
  userAgent?: string;
  auth?: AuthPrincipal | null;
};

const storage = new AsyncLocalStorage<AuditRequestContext>();

export function runWithAuditContext<T>(
  ctx: AuditRequestContext,
  fn: () => T,
): T {
  return storage.run(ctx, fn);
}

export function getAuditContext(): AuditRequestContext {
  return storage.getStore() ?? {};
}

export function setAuditAuth(auth: AuthPrincipal | null | undefined): void {
  const store = storage.getStore();
  if (store) {
    store.auth = auth ?? null;
  }
}
