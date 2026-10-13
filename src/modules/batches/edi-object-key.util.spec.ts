import {
  assertEdiObjectKeyBelongsToActor,
  assertEdiOriginalFilename,
  ediFilenameFromObjectKey,
  isAllowedEdiMimeType,
  mintEdiObjectKey,
  mintEdiObjectKeyAllowingZero,
  requireTenantAndUserIds,
  resolveEdiUploadActor,
  STAFF_EDI_KEY_TENANT_ID,
} from './edi-object-key.util';

describe('edi-object-key.util', () => {
  it('mints keys with integer tenant and user segments (no UUID)', () => {
    const key = mintEdiObjectKey(12, 34);
    expect(key).toMatch(/^edi\/12\/34\/\d+-[a-f0-9]{12}\.edi$/);
    expect(key.toLowerCase()).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
    );
  });

  it('allows zero segments for unbound multipart actors', () => {
    const key = mintEdiObjectKeyAllowingZero(null, null);
    expect(key).toMatch(/^edi\/0\/0\/\d+-[a-f0-9]{12}\.edi$/);
  });

  it('resolves platform staff to key tenant 0 and null DB tenant', () => {
    const actor = resolveEdiUploadActor({
      typ: 'user',
      role: 'admin',
      tenantId: null,
      userId: 7,
    });
    expect(actor).toEqual({
      dbTenantId: null,
      keyTenantId: STAFF_EDI_KEY_TENANT_ID,
      userId: 7,
    });
    const key = mintEdiObjectKey(actor.keyTenantId, actor.userId);
    expect(key).toMatch(/^edi\/0\/7\//);
    expect(assertEdiObjectKeyBelongsToActor(key, actor.keyTenantId, actor.userId)).toBe(
      key,
    );
  });

  it('requires tenant for non-staff principals', () => {
    expect(() =>
      resolveEdiUploadActor({
        typ: 'user',
        role: 'customer',
        tenantId: null,
        userId: 7,
      }),
    ).toThrow(/tenant context/i);
  });

  it('asserts object key belongs to tenant/user', () => {
    const key = mintEdiObjectKey(5, 9);
    expect(assertEdiObjectKeyBelongsToActor(key, 5, 9)).toBe(key);
    expect(() => assertEdiObjectKeyBelongsToActor(key, 5, 99)).toThrow(
      /does not belong/,
    );
    expect(() => assertEdiObjectKeyBelongsToActor('edi/5/9/../x.edi', 5, 9)).toThrow();
  });

  it('requireTenantAndUserIds still rejects null tenant', () => {
    expect(requireTenantAndUserIds(1, 2)).toEqual({ tenantId: 1, userId: 2 });
    expect(() => requireTenantAndUserIds(null, 2)).toThrow(/tenant context/i);
    expect(() => requireTenantAndUserIds(1, null)).toThrow(/user context/i);
  });

  it('validates filename and mime allowlist', () => {
    expect(() => assertEdiOriginalFilename('claims.edi')).not.toThrow();
    expect(() => assertEdiOriginalFilename('../x.edi')).toThrow();
    expect(() => assertEdiOriginalFilename('notes.pdf')).toThrow();
    expect(isAllowedEdiMimeType('application/EDI-X12')).toBe(true);
    expect(isAllowedEdiMimeType('text/plain')).toBe(true);
    expect(isAllowedEdiMimeType('application/pdf')).toBe(false);
  });

  it('extracts filename from object key', () => {
    expect(ediFilenameFromObjectKey('edi/1/2/abc.edi')).toBe('abc.edi');
  });
});
