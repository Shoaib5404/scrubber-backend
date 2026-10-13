import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { assertSafeStorageKey } from '../../adapters/storage/storage-key.util';
import { isStaffRole } from '../auth/auth.constants';

const EDI_KEY_PREFIX = 'edi';

/** Platform staff use key segment `0` (BatchFile.tenantId stays null). */
export const STAFF_EDI_KEY_TENANT_ID = 0;

export type EdiUploadActor = {
  /** Persisted on BatchFile.tenantId — null for platform staff. */
  dbTenantId: number | null;
  /** Object-key tenant segment — `0` for platform staff, else real tenant id. */
  keyTenantId: number;
  userId: number;
};

/**
 * Resolve who may mint/complete EDI object keys.
 * - Tenant users / API clients: require real tenantId + userId
 * - Platform staff (admin/super_admin/user): tenant optional; key uses `0/{userId}`
 */
export function resolveEdiUploadActor(auth: {
  typ: string;
  role: string | null;
  tenantId: number | null;
  userId: number | null;
}): EdiUploadActor {
  if (auth.userId == null || auth.userId <= 0) {
    throw new ForbiddenException(
      'A user context is required to upload EDI files to object storage.',
    );
  }

  const staff =
    auth.typ === 'user' && !!auth.role && isStaffRole(auth.role);

  if (staff) {
    return {
      dbTenantId: null,
      keyTenantId: STAFF_EDI_KEY_TENANT_ID,
      userId: auth.userId,
    };
  }

  if (auth.tenantId == null || auth.tenantId <= 0) {
    throw new ForbiddenException(
      'A tenant context is required to upload EDI files to object storage.',
    );
  }

  return {
    dbTenantId: auth.tenantId,
    keyTenantId: auth.tenantId,
    userId: auth.userId,
  };
}

/**
 * Mint a tenant+user namespaced EDI object key (integer IDs, no UUID).
 * Example: `edi/12/34/1710000000000-a1b2c3d4e5f6.edi`
 * Staff: `edi/0/{userId}/…`
 */
export function mintEdiObjectKey(keyTenantId: number, userId: number): string {
  assertNonNegativeInt(keyTenantId, 'keyTenantId');
  assertPositiveInt(userId, 'userId');
  const storedName = `${Date.now()}-${randomBytes(6).toString('hex')}.edi`;
  return assertSafeStorageKey(
    `${EDI_KEY_PREFIX}/${keyTenantId}/${userId}/${storedName}`,
  );
}

/**
 * For multipart / API clients when tenant or user may be unbound — use `0` segment.
 * Prefer {@link mintEdiObjectKey} + {@link resolveEdiUploadActor} for web uploads.
 */
export function mintEdiObjectKeyAllowingZero(
  tenantId: number | null,
  userId: number | null,
): string {
  const t = tenantId != null && tenantId > 0 ? tenantId : 0;
  const u = userId != null && userId > 0 ? userId : 0;
  const storedName = `${Date.now()}-${randomBytes(6).toString('hex')}.edi`;
  return assertSafeStorageKey(`${EDI_KEY_PREFIX}/${t}/${u}/${storedName}`);
}

/** Filename segment of an object key (`…/name.edi`). */
export function ediFilenameFromObjectKey(objectKey: string): string {
  const safe = assertSafeStorageKey(objectKey);
  const parts = safe.split('/');
  return parts[parts.length - 1] ?? safe;
}

/**
 * Ensure the object key was minted for this actor's key tenant + user and has no traversal.
 */
export function assertEdiObjectKeyBelongsToActor(
  objectKey: string,
  keyTenantId: number,
  userId: number,
): string {
  assertNonNegativeInt(keyTenantId, 'keyTenantId');
  assertPositiveInt(userId, 'userId');
  const safe = assertSafeStorageKey(objectKey);
  const expectedPrefix = `${EDI_KEY_PREFIX}/${keyTenantId}/${userId}/`;
  if (!safe.startsWith(expectedPrefix) || safe.includes('..')) {
    throw new ForbiddenException('Object key does not belong to this tenant/user.');
  }
  const rest = safe.slice(expectedPrefix.length);
  if (!rest || rest.includes('/')) {
    throw new BadRequestException('Invalid EDI object key.');
  }
  if (!rest.toLowerCase().endsWith('.edi')) {
    throw new BadRequestException('EDI object key must end with .edi');
  }
  return safe;
}

/** @deprecated Prefer {@link resolveEdiUploadActor}. Kept for older call sites/tests. */
export function requireTenantAndUserIds(
  tenantId: number | null,
  userId: number | null,
): { tenantId: number; userId: number } {
  if (tenantId == null || tenantId <= 0) {
    throw new ForbiddenException(
      'A tenant context is required to upload EDI files to object storage.',
    );
  }
  if (userId == null || userId <= 0) {
    throw new ForbiddenException(
      'A user context is required to upload EDI files to object storage.',
    );
  }
  return { tenantId, userId };
}

function assertPositiveInt(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new BadRequestException(`${label} must be a positive integer.`);
  }
}

function assertNonNegativeInt(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new BadRequestException(`${label} must be a non-negative integer.`);
  }
}

/** Allowed declared MIME types for EDI browser uploads. */
export const EDI_UPLOAD_ALLOWED_MIME_TYPES = [
  'application/edi-x12',
  'application/EDI-X12',
  'text/plain',
  'application/octet-stream',
] as const;

export function normalizeEdiMimeType(mimeType: string): string {
  return String(mimeType ?? '')
    .trim()
    .toLowerCase();
}

export function isAllowedEdiMimeType(mimeType: string): boolean {
  const normalized = normalizeEdiMimeType(mimeType);
  return EDI_UPLOAD_ALLOWED_MIME_TYPES.some(
    (allowed) => allowed.toLowerCase() === normalized,
  );
}

export function assertEdiOriginalFilename(originalFilename: string): void {
  const name = String(originalFilename ?? '').trim();
  if (!name) {
    throw new BadRequestException('originalFilename is required.');
  }
  if (name.includes('..') || name.includes('/') || name.includes('\\')) {
    throw new BadRequestException('Invalid originalFilename.');
  }
  if (!name.toLowerCase().endsWith('.edi') && !name.toLowerCase().endsWith('.txt')) {
    throw new BadRequestException('EDI filename must end with .edi or .txt');
  }
}
