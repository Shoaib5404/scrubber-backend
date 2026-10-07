/** Laravel job class → BullMQ queue / job name mapping (SP-0 inventory). */
export const QUEUE_NAMES = {
  VALIDATE_CLAIM: 'validate-claim',
  VALIDATE_BATCH: 'validate-batch',
  FINALIZE_BATCH_VALIDATION: 'finalize-batch-validation',
  PROCESS_BATCH_FILE: 'process-batch-file',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const ALL_QUEUE_NAMES: QueueName[] = Object.values(QUEUE_NAMES);

/** Laravel tries = 3 */
export const DEFAULT_JOB_ATTEMPTS = 3;

/** Exponential backoff starting at 2s (BullMQ uses ms). */
export const DEFAULT_BACKOFF = { type: 'exponential' as const, delay: 2_000 };

export const SCHEDULER_LOCK_KEY = 'scrubber:scheduler:detect-stalled-queues';
export const SCHEDULER_INTERVAL_MS = 5 * 60_000;

export type ValidateClaimJobData = { claimId: number; force: boolean };
export type ValidateBatchJobData = { batchId: number; force: boolean };
export type FinalizeBatchJobData = { batchId: number };
export type ProcessBatchFileJobData = { batchId: number; force: boolean };

export function validateClaimJobId(claimId: number): string {
  return `validate-claim:${claimId}`;
}

export function validateBatchJobId(batchId: number, force: boolean): string {
  return force ? `validate-batch:${batchId}-force` : `validate-batch:${batchId}`;
}

export function finalizeBatchJobId(batchId: number): string {
  return `finalize-batch:${batchId}`;
}

export function processBatchFileJobId(batchId: number, force: boolean): string {
  return force ? `process-batch:${batchId}-force` : `process-batch:${batchId}`;
}

/** Laravel ClaimStatus::isTerminal */
export const TERMINAL_CLAIM_STATUSES = new Set(['valid', 'warning', 'error', 'corrected']);
