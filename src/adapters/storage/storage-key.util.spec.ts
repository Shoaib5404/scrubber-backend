import { BadRequestException } from '@nestjs/common';
import { assertSafeStorageKey } from './storage-key.util';

describe('assertSafeStorageKey', () => {
  it('accepts relative edi keys', () => {
    expect(assertSafeStorageKey('edi_files/123-abc.edi')).toBe('edi_files/123-abc.edi');
  });

  it('strips leading slashes and normalizes backslashes', () => {
    expect(assertSafeStorageKey('\\edi_files\\a.edi')).toBe('edi_files/a.edi');
  });

  it('rejects traversal and empty keys', () => {
    expect(() => assertSafeStorageKey('../etc/passwd')).toThrow(BadRequestException);
    expect(() => assertSafeStorageKey('edi_files/../secret')).toThrow(BadRequestException);
    expect(() => assertSafeStorageKey('')).toThrow(BadRequestException);
    expect(() => assertSafeStorageKey('edi_files//a.edi')).toThrow(BadRequestException);
  });
});
