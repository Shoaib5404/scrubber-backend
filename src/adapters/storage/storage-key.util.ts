import { BadRequestException } from '@nestjs/common';

/**
 * Reject empty keys and path traversal (`..`, absolute paths, backslashes).
 * Keys are relative object names such as `edi_files/123-abcdef.edi`.
 */
export function assertSafeStorageKey(key: string): string {
  const normalized = String(key ?? '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .trim();
  if (!normalized) {
    throw new BadRequestException('Storage key is required.');
  }
  const segments = normalized.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) {
    throw new BadRequestException('Invalid storage key.');
  }
  if (normalized.includes('\0')) {
    throw new BadRequestException('Invalid storage key.');
  }
  return normalized;
}
