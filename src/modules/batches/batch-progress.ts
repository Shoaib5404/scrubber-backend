/** Counted claim progress for an existing batch. Percentage is never stored. */

export type BatchProgressSnapshot = {
  mode: 'counted' | 'indeterminate';
  processed: number;
  total: number;
  percentage: number | null;
};

const COMPLETE_STATUSES = new Set(['validated', 'exported']);

export function batchProgressSnapshot(
  status: string,
  totalClaims: number,
  pendingClaims: number,
): BatchProgressSnapshot {
  const total = Number.isFinite(totalClaims) ? Math.max(0, Math.trunc(totalClaims)) : 0;
  const pending = Number.isFinite(pendingClaims) ? Math.max(0, Math.trunc(pendingClaims)) : 0;
  if (total === 0) {
    return { mode: 'indeterminate', processed: 0, total: 0, percentage: null };
  }

  const processed = Math.min(total, Math.max(0, total - pending));
  if (COMPLETE_STATUSES.has(status) && pending === 0) {
    return { mode: 'counted', processed: total, total, percentage: 100 };
  }

  const raw = Math.round((processed / total) * 100);
  const percentage = Math.min(raw, COMPLETE_STATUSES.has(status) ? raw : 99);
  return { mode: 'counted', processed, total, percentage };
}

/** User-facing stage key. Does not replace the stored batch status. */
export function batchStageKey(status: string): string {
  switch (status) {
    case 'parsed':
      return 'parsed';
    case 'validating':
      return 'validating';
    case 'validated':
      return 'validation_complete';
    case 'exported':
      return 'exported';
    case 'error':
      return 'error';
    default:
      return 'uploaded';
  }
}

/** Fixed sentences. Never the raw error_message or a stack trace. */
export function batchProgressMessage(status: string): string {
  switch (status) {
    case 'pending':
      return 'The file is queued.';
    case 'processing':
      return 'Saving claims.';
    case 'parsed':
      return 'Claims are saved. Validation has not started.';
    case 'validating':
      return 'Validating claims.';
    case 'validated':
      return 'Processing completed. Review the claims.';
    case 'exported':
      return 'This batch has been exported.';
    case 'error':
      return 'Processing failed. Review the batch before continuing.';
    default:
      return 'Processing the file.';
  }
}
