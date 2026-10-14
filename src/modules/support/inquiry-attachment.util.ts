import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { assertSafeStorageKey } from '../../adapters/storage/storage-key.util';
import {
  INQUIRY_ALLOWED_EXTENSIONS,
  INQUIRY_ALLOWED_MIME_TYPES,
  INQUIRY_ATTACHMENT_PREFIX,
} from './support.constants';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const PE_MZ = Buffer.from([0x4d, 0x5a]);

export function normalizeInquiryMimeType(mimeType: string): string {
  return String(mimeType ?? '')
    .trim()
    .toLowerCase()
    .split(';')[0]!
    .trim();
}

export function inquiryExtensionFromFilename(filename: string): string {
  const name = String(filename ?? '').trim().toLowerCase();
  const idx = name.lastIndexOf('.');
  if (idx < 0) return '';
  return name.slice(idx);
}

export function assertInquiryOriginalFilename(originalFilename: string): string {
  const name = String(originalFilename ?? '').trim();
  if (!name) {
    throw new BadRequestException('originalFilename is required.');
  }
  if (
    name.includes('..') ||
    name.includes('/') ||
    name.includes('\\') ||
    name.includes('\0')
  ) {
    throw new BadRequestException('Invalid originalFilename.');
  }
  // Reject double extensions that hide executables (e.g. screenshot.png.exe).
  const lower = name.toLowerCase();
  const parts = lower.split('.');
  if (parts.length > 2) {
    const dangerous = ['exe', 'bat', 'cmd', 'js', 'html', 'htm', 'php', 'dll', 'scr'];
    if (parts.some((p) => dangerous.includes(p))) {
      throw new BadRequestException('Filename contains a disallowed extension.');
    }
  }
  const ext = inquiryExtensionFromFilename(name);
  if (
    !(INQUIRY_ALLOWED_EXTENSIONS as readonly string[]).includes(ext)
  ) {
    throw new BadRequestException(
      `Unsupported file type. Allowed: ${INQUIRY_ALLOWED_EXTENSIONS.join(', ')}`,
    );
  }
  return name.slice(0, 255);
}

export function isAllowedInquiryMimeType(
  mimeType: string,
  extension: string,
): boolean {
  const normalized = normalizeInquiryMimeType(mimeType);
  if (
    !(INQUIRY_ALLOWED_MIME_TYPES as readonly string[]).includes(normalized)
  ) {
    return false;
  }
  if (extension === '.png') return normalized === 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') {
    return normalized === 'image/jpeg';
  }
  if (extension === '.txt') return normalized === 'text/plain';
  if (extension === '.edi' || extension === '.x12') {
    return (
      normalized === 'application/edi-x12' ||
      normalized === 'text/plain' ||
      normalized === 'application/octet-stream'
    );
  }
  return false;
}

export function assertInquiryMimeForExtension(
  mimeType: string,
  extension: string,
): string {
  const normalized = normalizeInquiryMimeType(mimeType);
  if (!isAllowedInquiryMimeType(normalized, extension)) {
    throw new BadRequestException(
      `MIME type "${mimeType}" is not allowed for ${extension} files.`,
    );
  }
  return normalized;
}

export function mintInquiryObjectKey(
  tenantId: number,
  userId: number,
  extension: string,
): string {
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new BadRequestException('tenantId must be a positive integer.');
  }
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new BadRequestException('userId must be a positive integer.');
  }
  const ext = extension.startsWith('.') ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
  if (!(INQUIRY_ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new BadRequestException('Unsupported attachment extension.');
  }
  return assertSafeStorageKey(
    `${INQUIRY_ATTACHMENT_PREFIX}/${tenantId}/${userId}/${randomUUID()}${ext}`,
  );
}

export function assertInquiryObjectKeyBelongsToActor(
  objectKey: string,
  tenantId: number,
  userId: number,
): string {
  const safe = assertSafeStorageKey(objectKey);
  const expectedPrefix = `${INQUIRY_ATTACHMENT_PREFIX}/${tenantId}/${userId}/`;
  if (!safe.startsWith(expectedPrefix) || safe.includes('..')) {
    throw new ForbiddenException(
      'Object key does not belong to this tenant/user.',
    );
  }
  const rest = safe.slice(expectedPrefix.length);
  if (!rest || rest.includes('/')) {
    throw new BadRequestException('Invalid inquiry attachment object key.');
  }
  const ext = inquiryExtensionFromFilename(rest);
  if (!(INQUIRY_ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new BadRequestException('Inquiry attachment key has an invalid extension.');
  }
  return safe;
}

/** Validate magic bytes / reject obvious executables for the declared extension. */
export function assertInquiryAttachmentContent(
  buffer: Buffer,
  extension: string,
): void {
  if (!buffer.length) {
    throw new BadRequestException('Attachment file is empty.');
  }
  if (buffer.subarray(0, 2).equals(PE_MZ)) {
    throw new BadRequestException('Executable content is not allowed.');
  }
  const ext = extension.toLowerCase();
  if (ext === '.png') {
    if (!buffer.subarray(0, 4).equals(PNG_MAGIC)) {
      throw new BadRequestException('File content is not a valid PNG image.');
    }
    return;
  }
  if (ext === '.jpg' || ext === '.jpeg') {
    if (!buffer.subarray(0, 3).equals(JPEG_MAGIC)) {
      throw new BadRequestException('File content is not a valid JPEG image.');
    }
    return;
  }
  // text / edi / x12 — reject NUL-heavy binary blobs
  const sample = buffer.subarray(0, Math.min(buffer.length, 512));
  let nul = 0;
  for (const byte of sample) {
    if (byte === 0) nul += 1;
  }
  if (nul > 2) {
    throw new BadRequestException(
      'File content does not look like a text or EDI document.',
    );
  }
}
