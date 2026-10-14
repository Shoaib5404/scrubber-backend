import {
  assertInquiryAttachmentContent,
  assertInquiryMimeForExtension,
  assertInquiryObjectKeyBelongsToActor,
  assertInquiryOriginalFilename,
  isAllowedInquiryMimeType,
  mintInquiryObjectKey,
} from './inquiry-attachment.util';

describe('inquiry-attachment.util', () => {
  it('accepts allowlisted filenames and rejects path tricks', () => {
    expect(assertInquiryOriginalFilename('sample.edi')).toBe('sample.edi');
    expect(assertInquiryOriginalFilename('shot.PNG')).toBe('shot.PNG');
    expect(() => assertInquiryOriginalFilename('../evil.png')).toThrow();
    expect(() => assertInquiryOriginalFilename('file.jpg.exe')).toThrow();
    expect(() => assertInquiryOriginalFilename('note.pdf')).toThrow();
  });

  it('validates mime types per extension', () => {
    expect(isAllowedInquiryMimeType('image/png', '.png')).toBe(true);
    expect(isAllowedInquiryMimeType('image/jpeg', '.jpg')).toBe(true);
    expect(isAllowedInquiryMimeType('text/plain', '.edi')).toBe(true);
    expect(isAllowedInquiryMimeType('image/png', '.jpg')).toBe(false);
    expect(() => assertInquiryMimeForExtension('application/pdf', '.pdf')).toThrow();
  });

  it('mints and validates tenant-scoped object keys', () => {
    const key = mintInquiryObjectKey(12, 34, '.png');
    expect(key.startsWith('inquiries/12/34/')).toBe(true);
    expect(key.endsWith('.png')).toBe(true);
    expect(assertInquiryObjectKeyBelongsToActor(key, 12, 34)).toBe(key);
    expect(() => assertInquiryObjectKeyBelongsToActor(key, 99, 34)).toThrow();
  });

  it('checks magic bytes for images and rejects PE executables', () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('rest'),
    ]);
    expect(() => assertInquiryAttachmentContent(png, '.png')).not.toThrow();

    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('x')]);
    expect(() => assertInquiryAttachmentContent(jpeg, '.jpg')).not.toThrow();

    const pe = Buffer.concat([Buffer.from([0x4d, 0x5a]), Buffer.alloc(20)]);
    expect(() => assertInquiryAttachmentContent(pe, '.txt')).toThrow(/Executable/);

    const text = Buffer.from('ISA*00*          *00*          *ZZ*SENDER');
    expect(() => assertInquiryAttachmentContent(text, '.edi')).not.toThrow();
  });
});
